//! Regression tests on real temporary files, not a model of the write protocol.
//! Faults are injected into the private writer. This does not simulate every OS,
//! filesystem, full physical disk, or power-loss durability boundary.
use super::*;

struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("gin-save-{}", Uuid::new_v4()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn assert_no_temporary_files(&self) {
        assert!(fs::read_dir(&self.0).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().ends_with(".tmp")));
    }
}
impl Drop for Scratch { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn document(sequence: &str) -> String {
    json!({"schemaVersion":5,"name":"Fixture","sequence":sequence,"topology":"linear","features":[],"primers":[]}).to_string()
}

#[test]
fn every_prepublication_failure_preserves_original_or_absence() {
    for existing in [false, true] {
        for point in [WriteStage::Created, WriteStage::PartiallyWritten, WriteStage::Written, WriteStage::Synced, WriteStage::BeforePublish] {
            let scratch = Scratch::new();
            let path = scratch.0.join("document.sg.json");
            let predecessor = b"exact predecessor";
            if existing { fs::write(&path, predecessor).unwrap(); }
            let expected = existing.then(|| hash(predecessor));
            let mut visited = Vec::new();
            let result = replace_observed(&path, b"new document content", expected.as_deref(), 100, |stage| {
                visited.push(stage);
                if stage == point { Err(format!("injected {point:?} failure")) } else { Ok(()) }
            });
            assert!(result.is_err(), "{point:?}");
            assert_eq!(visited.last(), Some(&point));
            if existing { assert_eq!(fs::read(&path).unwrap(), predecessor); } else { assert!(!path.exists()); }
            scratch.assert_no_temporary_files();
        }
    }
}

#[test]
fn acknowledged_write_visits_all_stages_in_order() {
    let scratch = Scratch::new(); let path = scratch.0.join("new.sg.json"); let mut visited = Vec::new();
    replace_observed(&path, b"complete output", None, 100, |stage| { visited.push(stage); Ok(()) }).unwrap();
    assert_eq!(visited, vec![WriteStage::Created,WriteStage::PartiallyWritten,WriteStage::Written,WriteStage::Synced,WriteStage::BeforePublish,WriteStage::Published,WriteStage::BeforeVerify]);
    assert_eq!(fs::read(&path).unwrap(), b"complete output"); scratch.assert_no_temporary_files();
}

#[test]
fn late_external_modification_or_deletion_is_never_replaced() {
    for deletion in [false, true] {
        let scratch = Scratch::new(); let path = scratch.0.join("edited.sg.json"); fs::write(&path, b"old").unwrap();
        let result = replace_observed(&path, b"ours", Some(&hash(b"old")), 100, |stage| {
            if stage == WriteStage::BeforePublish {
                if deletion { fs::remove_file(&path).unwrap(); } else { fs::write(&path, b"external").unwrap(); }
            }
            Ok(())
        });
        assert!(result.unwrap_err().contains("File conflict"));
        if deletion { assert!(!path.exists()); } else { assert_eq!(fs::read(&path).unwrap(), b"external"); }
        scratch.assert_no_temporary_files();
    }
}

#[test]
fn readonly_change_after_preparation_is_respected() {
    let scratch = Scratch::new(); let path = scratch.0.join("edited.sg.json"); fs::write(&path, b"old").unwrap();
    let permissions = fs::metadata(&path).unwrap().permissions();
    let result = replace_observed(&path, b"new", Some(&hash(b"old")), 100, |stage| {
        if stage == WriteStage::BeforePublish {
            let mut readonly = permissions.clone(); readonly.set_readonly(true); fs::set_permissions(&path, readonly).unwrap();
        }
        Ok(())
    });
    fs::set_permissions(&path, permissions).unwrap();
    assert!(result.unwrap_err().contains("became read-only")); assert_eq!(fs::read(&path).unwrap(), b"old");
    scratch.assert_no_temporary_files();
}

#[test]
fn postpublication_failures_never_return_a_false_success() {
    for point in [WriteStage::Published, WriteStage::BeforeVerify] {
        let scratch = Scratch::new(); let path = scratch.0.join("changed.sg.json"); fs::write(&path,b"old").unwrap();
        let error = replace_observed(&path,b"new",Some(&hash(b"old")),100,|stage| {
            if stage == point { Err("injected confirmation failure".into()) } else { Ok(()) }
        }).unwrap_err();
        assert!(error.contains("destination was replaced"));
        assert_eq!(fs::read(&path).unwrap(),b"new"); scratch.assert_no_temporary_files();
    }
}

#[test]
fn failed_readback_explicitly_reports_a_replaced_destination() {
    let scratch=Scratch::new(); let path=scratch.0.join("file.sg.json"); fs::write(&path,b"old").unwrap();
    let error=replace_observed(&path,b"new",Some(&hash(b"old")),100,|stage| {
        if stage==WriteStage::BeforeVerify { fs::remove_file(&path).unwrap(); } Ok(())
    }).unwrap_err();
    assert!(error.contains("destination was replaced")); assert!(error.contains("Save As")); scratch.assert_no_temporary_files();
}

#[test]
fn corrupted_readback_is_not_acknowledged() {
    let scratch=Scratch::new(); let path=scratch.0.join("file.sg.json"); fs::write(&path,b"old").unwrap();
    let error=replace_observed(&path,b"new",Some(&hash(b"old")),100,|stage| {
        if stage==WriteStage::BeforeVerify { fs::write(&path,b"different").unwrap(); } Ok(())
    }).unwrap_err();
    assert!(error.contains("read-back content differs")); assert_eq!(fs::read(&path).unwrap(),b"different");
    scratch.assert_no_temporary_files();
}

#[test]
fn failed_backup_keeps_document_and_write_grant_unchanged() {
    let scratch=Scratch::new(); let mut store=FileStore::new(scratch.0.join("app")).unwrap();
    let path=scratch.0.join("file.sg.json"); let first=document("ACGT");
    let grant=store.save_to(&path,&first,None,None).unwrap(); let token=grant["token"].as_str().unwrap();
    let digest=store.grants[token].digest.clone();
    fs::remove_dir(store.data_dir.join("backups")).unwrap();
    fs::write(store.data_dir.join("backups"),b"not a directory").unwrap();
    assert!(store.save(token,&document("ACGTA")).is_err());
    assert_eq!(store.grants[token].digest,digest); assert_eq!(fs::read(&path).unwrap(),first.as_bytes());
    scratch.assert_no_temporary_files();
}

#[test]
fn oversized_save_is_rejected_before_file_or_backup_changes() {
    let scratch=Scratch::new(); let mut store=FileStore::new(scratch.0.join("app")).unwrap();
    let path=scratch.0.join("file.sg.json"); let first=document("ACGT"); let grant=store.save_to(&path,&first,None,None).unwrap();
    let token=grant["token"].as_str().unwrap(); let digest=store.grants[token].digest.clone();
    let oversized=format!("{}{}",first," ".repeat(DOCUMENT_LIMIT));
    assert!(store.save(token,&oversized).is_err()); assert_eq!(store.grants[token].digest,digest);
    assert_eq!(fs::read(&path).unwrap(),first.as_bytes());
    assert_eq!(fs::read_dir(store.data_dir.join("backups")).unwrap().count(),0);
    scratch.assert_no_temporary_files();
}

#[test]
fn unicode_and_space_paths_roundtrip_with_exact_predecessor_backup() {
    let scratch=Scratch::new(); let folder=scratch.0.join("Travail été Δ 研究"); fs::create_dir(&folder).unwrap();
    let path=folder.join("plasmide α 01.sg.json"); let mut store=FileStore::new(scratch.0.join("app")).unwrap();
    let first=document("ACGT"); let grant=store.save_to(&path,&first,None,None).unwrap();
    let second=document("NNACGT"); let saved=store.save(grant["token"].as_str().unwrap(),&second).unwrap();
    assert_eq!(fs::read(&path).unwrap(),second.as_bytes());
    assert_eq!(fs::read(saved["backup"].as_str().unwrap()).unwrap(),first.as_bytes());
    let reopened=store.open(&path).unwrap(); assert_eq!(STANDARD.decode(reopened["base64"].as_str().unwrap()).unwrap(),second.as_bytes());
}

#[cfg(unix)]
#[test]
fn valid_long_filename_does_not_overflow_lock_filename_limit() {
    let scratch=Scratch::new(); let path=scratch.0.join(format!("{}.sg.json","a".repeat(235)));
    let mut store=FileStore::new(scratch.0.join("app")).unwrap(); let first=document("ACGT");
    let grant=store.save_to(&path,&first,None,None).unwrap();
    store.save(grant["token"].as_str().unwrap(),&document("ACGTA")).unwrap();
    assert!(sibling_lock(&path,".gin-schnaps.transaction.lock").file_name().unwrap().as_encoded_bytes().len()<=255);
    assert_eq!(fs::read(&path).unwrap(),document("ACGTA").as_bytes());
}

#[test]
fn ordinary_lock_names_remain_compatible_with_previous_versions() {
    let scratch=Scratch::new(); let path=scratch.0.join("file.sg.json");
    assert_eq!(sibling_lock(&path,".gin-schnaps.lock"),scratch.0.join(".file.sg.json.gin-schnaps.lock"));
    assert_eq!(sibling_lock(&path,".gin-schnaps.transaction.lock"),scratch.0.join(".file.sg.json.gin-schnaps.transaction.lock"));
}

#[cfg(unix)]
#[test]
fn invalid_unicode_path_is_refused_not_lossily_aliased() {
    use std::os::unix::ffi::OsStringExt;
    let scratch=Scratch::new(); let path=scratch.0.join(std::ffi::OsString::from_vec(vec![0xff,b'.',b'f',b'a']));
    fs::write(&path,b"original").unwrap(); assert!(checked_path(&path).unwrap_err().contains("valid Unicode"));
    assert_eq!(fs::read(&path).unwrap(),b"original");
}

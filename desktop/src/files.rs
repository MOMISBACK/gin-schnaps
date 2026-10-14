//! Bounded file IO. This module knows nothing about biological coordinates.
//! The TypeScript domain validator remains the scientific source of truth.
use std::{collections::{BTreeMap, BTreeSet}, fs::{self, File, OpenOptions}, io::{Read, Write}, path::{Path, PathBuf}};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
pub const DOCUMENT_LIMIT: usize = 4_000_000;
pub const BACKUP_LIMIT: usize = 12_000_000;
pub const EXPORT_LIMIT: usize = 16_000_000;
pub const RECOVERY_LIMIT: usize = 12_000_000;
pub fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn io(e: std::io::Error) -> String { format!("File operation failed: {e}") }

/// Resolve the parent, not the last component: following a symlink at the target
/// would turn a user-approved file into a write to a different file.
pub fn checked_path(path: &Path) -> Result<PathBuf> {
    let parent = path.parent().ok_or("A file parent is required")?.canonicalize().map_err(io)?;
    let name = path.file_name().ok_or("A file name is required")?;
    let target = parent.join(name);
    if target.to_str().is_none() {
        return Err("File paths must contain valid Unicode. Choose another file name or folder.".into());
    }
    match fs::symlink_metadata(&target) {
        Ok(m) if m.file_type().is_symlink() || !m.is_file() => return Err("Symlinks and non-regular files are not supported. Choose the real file.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {},
        Err(e) => return Err(io(e)),
        _ => {}
    }
    Ok(target)
}
pub fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>> {
    let p = checked_path(path)?;
    let file = File::open(p).map_err(io)?;
    if file.metadata().map_err(io)?.len() > limit as u64 { return Err("File exceeds the supported size limit".into()); }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1).read_to_end(&mut bytes).map_err(io)?;
    if bytes.len() > limit { return Err("File grew beyond the supported size limit".into()); }
    Ok(bytes)
}
pub fn snapshot(path: &Path, limit: usize) -> Result<Option<String>> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io(e)),
        Ok(_) => Ok(Some(hash(&read_bounded(path, limit)?)))
    }
}
fn private_file(path: &Path, create_new: bool) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    if create_new { options.create_new(true); } else { options.create(true).truncate(false); }
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    options.open(path).map_err(io)
}
pub fn lock_path(path: &Path) -> Result<File> {
    let path = checked_path(path)?;
    let file = private_file(&path, false)?;
    file.try_lock().map_err(|_| "Another process is writing this file. Retry after it finishes.".to_string())?;
    Ok(file) // Dropping the handle releases the OS lock, including after a crash.
}
struct Pending(PathBuf);
impl Drop for Pending { fn drop(&mut self) { let _ = fs::remove_file(&self.0); } }

/// Keep the historical lock path for ordinary names so adjacent versions still
/// coordinate. A legal long file name must not become illegal after adding a
/// lock suffix; use a fixed-size digest only for that otherwise-unsavable case.
fn sibling_lock(path: &Path, suffix: &str) -> PathBuf {
    let mut name = std::ffi::OsString::from(".");
    name.push(path.file_name().unwrap());
    name.push(suffix);
    if name.as_encoded_bytes().len() <= 255 {
        path.with_file_name(name)
    } else {
        path.with_file_name(format!(".gin-schnaps-{}{}", hash(path.file_name().unwrap().as_encoded_bytes()), suffix))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WriteStage { Created, PartiallyWritten, Written, Synced, BeforePublish, Published, BeforeVerify }

/// Fully prepare and sync a sibling temporary file before publication. The
/// observer is internal, not an IPC command, environment switch or user option.
/// Production always supplies a no-op; unit tests inject failures at boundaries.
/// Advisory locks are not a compare-and-swap against noncooperating writers.
pub fn replace(path: &Path, bytes: &[u8], expected: Option<&str>, limit: usize) -> Result<Vec<String>> {
    replace_observed(path, bytes, expected, limit, |_| Ok(()))
}
#[cfg(test)]
fn replace_checked(path: &Path, bytes: &[u8], expected: Option<&str>, limit: usize, before_commit: impl FnOnce() -> Result<()>) -> Result<Vec<String>> {
    let mut hook = Some(before_commit);
    replace_observed(path, bytes, expected, limit, |stage| {
        if stage == WriteStage::BeforePublish { hook.take().unwrap()()?; }
        Ok(())
    })
}
fn replace_observed(path: &Path, bytes: &[u8], expected: Option<&str>, limit: usize, mut observe: impl FnMut(WriteStage) -> Result<()>) -> Result<Vec<String>> {
    if bytes.len() > limit { return Err("Output exceeds the supported size limit".into()); }
    let path = checked_path(path)?;
    if expected.is_some() && fs::metadata(&path).map_err(io)?.permissions().readonly() {
        return Err("Destination is read-only. Save a separate copy instead.".into());
    }
    let _lock = lock_path(&sibling_lock(&path, ".gin-schnaps.lock"))?;
    if snapshot(&path, limit)?.as_deref() != expected { return Err("File conflict: the destination changed or disappeared. Use Save As with a different name, or reopen and compare.".into()); }
    let temp = Pending(path.with_file_name(format!(".gin-schnaps-{}.tmp", Uuid::new_v4())));
    let mut file = private_file(&temp.0, true)?;
    observe(WriteStage::Created)?;
    let middle = bytes.len() / 2;
    file.write_all(&bytes[..middle]).map_err(io)?;
    observe(WriteStage::PartiallyWritten)?;
    file.write_all(&bytes[middle..]).map_err(io)?;
    observe(WriteStage::Written)?;
    file.sync_all().map_err(io)?;
    drop(file);
    observe(WriteStage::Synced)?;
    observe(WriteStage::BeforePublish)?;
    if snapshot(&path, limit)?.as_deref() != expected { return Err("File conflict during writing. The existing destination was not replaced.".into()); }
    if expected.is_some() && fs::metadata(&path).map_err(io)?.permissions().readonly() {
        return Err("Destination became read-only while saving. The existing file was not replaced.".into());
    }
    if expected.is_some() {
        fs::rename(&temp.0, &path).map_err(io)?;
    } else {
        fs::hard_link(&temp.0, &path).map_err(io)?;
    }
    // From here onward, an error must not pretend that the old destination is
    // untouched. FileStore retains its old grant until verification succeeds.
    let after_publish = |error: String| format!("The destination was replaced, but save confirmation failed: {error}. Keep the open document and use Save As with a different name; a native predecessor backup may be available.");
    observe(WriteStage::Published).map_err(after_publish)?;
    let mut warnings = Vec::new();
    #[cfg(unix)]
    if File::open(path.parent().unwrap()).and_then(|f| f.sync_all()).is_err() {
        warnings.push("The file was written, but directory durability could not be confirmed.".into());
    }
    observe(WriteStage::BeforeVerify).map_err(after_publish)?;
    let readback = read_bounded(&path, limit).map_err(after_publish)?;
    if hash(&readback) != hash(bytes) {
        return Err(after_publish("read-back content differs".into()));
    }
    Ok(warnings)
}
pub fn check_document(bytes: &[u8]) -> Result<()> {
    if bytes.len() > DOCUMENT_LIMIT { return Err("Native documents are limited to 4 MB".into()); }
    let v: Value = serde_json::from_slice(bytes).map_err(|_| "Invalid document JSON")?;
    let seq = v["sequence"].as_str().ok_or("DNA sequence missing")?;
    if !matches!(v["schemaVersion"].as_u64(),Some(5 | 6 | 7)) || seq.len() > 100_000
        || (seq.is_empty() && (!matches!(v["schemaVersion"].as_u64(),Some(6 | 7)) || v["topology"]!="linear" || v["features"].as_array().is_none_or(|f| !f.is_empty())))
        || !seq.bytes().all(|b| b"ACGTRYSWKMBDHVN".contains(&b))
        || !matches!(v["topology"].as_str(), Some("linear" | "circular"))
        || v["features"].as_array().is_none_or(|f| f.len() > 1000)
        || v["primers"].as_array().is_none_or(|p| p.len() > 500)
        || v["name"].as_str().is_none() {
        return Err("Invalid native document envelope; nothing was written".into());
    }
    Ok(())
}
#[derive(Clone)]
pub struct Grant { pub path: PathBuf, pub digest: String, pub writable: bool }
pub struct FileStore { pub grants: BTreeMap<String, Grant>, pub data_dir: PathBuf, protected_sources: BTreeSet<PathBuf> }
impl FileStore {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&data_dir).map_err(io)?;
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700)).map_err(io)?; }
        Ok(Self { grants: BTreeMap::new(), protected_sources: BTreeSet::new(), data_dir: data_dir.canonicalize().map_err(io)? })
    }
    pub fn open(&mut self, path: &Path) -> Result<Value> {
        if self.grants.len() >= 128 { return Err("Too many file grants. Close documents or restart.".into()); }
        let path = checked_path(path)?;
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        if ![".sg.json",".json",".dna",".gb",".gbk",".genbank",".embl",".txt",".fa",".fasta",".fna"].iter().any(|ext| name.to_lowercase().ends_with(ext)) {
            return Err("Unsupported file extension".into());
        }
        // Portable backup import is read-only and has its own bounded format.
        let limit = if name.to_lowercase().ends_with(".gin-backup.json") { BACKUP_LIMIT } else { DOCUMENT_LIMIT };
        let bytes = read_bounded(&path, limit)?;
        if self.protected_sources.len() >= 4096 && !self.protected_sources.contains(&path) { return Err("Session source-path limit reached. Save open work and restart.".into()); }
        self.protected_sources.insert(path.clone());
        let token = Uuid::new_v4().to_string();
        let digest = hash(&bytes);
        let writable = name.to_lowercase().ends_with(".sg.json");
        self.grants.insert(token.clone(), Grant { path: path.clone(), digest: digest.clone(), writable });
        Ok(json!({"token":token,"name":name,"path":path.to_string_lossy(),"base64":STANDARD.encode(bytes),"writable":writable,"sha256":digest}))
    }
    pub fn save(&mut self, token: &str, text: &str) -> Result<Value> {
        check_document(text.as_bytes())?;
        let grant = self.grants.get(token).ok_or("Unknown file token: reopen the document or use Save As")?.clone();
        if !grant.writable { return Err("Imported source files are never overwritten. Use Save As.".into()); }
        self.save_to(&grant.path, text, Some(&grant.digest), Some(token))
    }
    pub fn save_to(&mut self, path: &Path, text: &str, expected: Option<&str>, existing_token: Option<&str>) -> Result<Value> {
        check_document(text.as_bytes())?;
        let path = checked_path(path)?;
        if !path.to_string_lossy().to_lowercase().ends_with(".sg.json") { return Err("Save documents with the .sg.json extension; interchange exports are separate.".into()); }
        if self.grants.values().any(|g| g.path == path && !g.writable) { return Err("This path is a protected imported source.".into()); }
        // Back up the exact predecessor first in a private, application-owned
        // directory, not into a user-controlled .bak file beside the document.
        let _transaction = lock_path(&sibling_lock(&path, ".gin-schnaps.transaction.lock"))?;
        let old = if expected.is_some() { Some(read_bounded(&path, DOCUMENT_LIMIT)?) } else { None };
        if old.as_deref().map(hash).as_deref() != expected { return Err("File conflict: destination changed; use a different Save As path.".into()); }
        let backup_dir = self.data_dir.join("backups");
        fs::create_dir_all(&backup_dir).map_err(io)?;
        let backup = backup_dir.join(format!("{}.sg.json", hash(path.to_string_lossy().as_bytes())));
        if let Some(bytes) = old {
            let before = snapshot(&backup, DOCUMENT_LIMIT)?;
            replace(&backup, &bytes, before.as_deref(), DOCUMENT_LIMIT)?;
        }
        let warnings = replace(&path, text.as_bytes(), expected, DOCUMENT_LIMIT)?;
        let token = existing_token.map(str::to_string).unwrap_or_else(|| Uuid::new_v4().to_string());
        let digest = hash(text.as_bytes());
        self.grants.insert(token.clone(), Grant { path: path.clone(), digest: digest.clone(), writable: true });
        Ok(json!({"token":token,"path":path.to_string_lossy(),"sha256":digest,"backup":if expected.is_some(){Some(backup.to_string_lossy().to_string())}else{None},"warnings":warnings}))
    }
    pub fn export(&self, path: &Path, bytes: &[u8], expected: Option<&str>) -> Result<Value> {
        let path = checked_path(path)?;
        if path.to_string_lossy().to_lowercase().ends_with(".sg.json") || self.protected_sources.contains(&path) || self.grants.values().any(|g| g.path == path) {
            return Err("Export cannot replace a source opened in this session or a native .sg.json. Choose another file.".into());
        }
        let warnings = replace(&path, bytes, expected, EXPORT_LIMIT)?;
        Ok(json!({"path":path.to_string_lossy(),"sha256":hash(bytes),"warnings":warnings}))
    }
    pub fn recovery(&self) -> Result<Value> {
        let path = self.data_dir.join("recovery.json");
        if snapshot(&path, 30_000_000)?.is_none() { return Ok(json!({"enabled":false,"revision":0,"current":null,"previous":null})); }
        let v:Value = serde_json::from_slice(&read_bounded(&path,30_000_000)?).map_err(|_| "Recovery file is corrupt; keep exported backups. No automatic overwrite.")?;
        if v["revision"].as_u64().is_none_or(|n|n>9_007_199_254_740_990) || !v["enabled"].is_boolean() {
            return Err("Invalid recovery metadata. No automatic overwrite.".into());
        }
        Ok(v)
    }
    pub fn write_recovery(&self, text: Option<&str>, expected: u64) -> Result<u64> {
        let path = self.data_dir.join("recovery.json");
        let _lock = lock_path(&self.data_dir.join("recovery-transaction.lock"))?;
        let current = self.recovery()?;
        if current["revision"].as_u64() != Some(expected) { return Err("Another window/process changed recovery. Writing paused.".into()); }
        if let Some(t) = text {
            if t.len()>RECOVERY_LIMIT { return Err("Recovery exceeds 12 MB".into()); }
            let v:Value=serde_json::from_str(t).map_err(|_|"Invalid recovery JSON")?;
            if v["version"]!=1 || v["documents"].as_array().is_none_or(|a|a.len()>16) {return Err("Invalid recovery envelope".into());}
            for d in v["documents"].as_array().unwrap(){check_document(d["doc"].to_string().as_bytes())?;}
        }
        let next = expected.checked_add(1).filter(|n|*n<=9_007_199_254_740_990).ok_or("Recovery revision exhausted")?;
        let previous = if text.is_some() {
            current["current"].as_str().filter(|s|serde_json::from_str::<Value>(s).is_ok()).map(|s|json!(s)).unwrap_or_else(||current["previous"].clone())
        } else { Value::Null };
        let bytes = json!({"enabled":text.is_some(),"revision":next,"current":text,"previous":previous}).to_string();
        let old=snapshot(&path,30_000_000)?;
        replace(&path,bytes.as_bytes(),old.as_deref(),30_000_000)?;
        Ok(next)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn dir() -> PathBuf { let p=std::env::temp_dir().join(format!("gin-schnaps-unit-{}",Uuid::new_v4()));fs::create_dir(&p).unwrap();p }
    fn doc(s:&str)->String{json!({"schemaVersion":5,"name":"Test","sequence":s,"topology":"linear","features":[],"primers":[]}).to_string()}
    #[test] fn schema_seven_envelope_roundtrips_without_native_scientific_claims() {
        let d=dir();let mut store=FileStore::new(d.join("app")).unwrap();let p=d.join("pcr.sg.json");
        let mut value:Value=serde_json::from_str(&doc("ACGT")).unwrap();value["schemaVersion"]=json!(7);
        value["creation"]=json!({"notice":"Scientific creation validation belongs to the TypeScript model."});
        let encoded=value.to_string();let saved=store.save_to(&p,&encoded,None,None).unwrap();
        assert_eq!(read_bounded(&p,DOCUMENT_LIMIT).unwrap(),encoded.as_bytes());
        value["sequence"]=json!("");assert!(store.save(saved["token"].as_str().unwrap(),&value.to_string()).is_ok());
        value["schemaVersion"]=json!(8);assert!(store.save(saved["token"].as_str().unwrap(),&value.to_string()).is_err());
        fs::remove_dir_all(d).unwrap();
    }
    #[test] fn write_read_and_backup_are_exact() {
        let d=dir();let mut store=FileStore::new(d.join("app")).unwrap();let p=d.join("test.sg.json");
        let a=doc("ACGT");let b=doc("ACGTA");
        let result=store.save_to(&p,&a,None,None).unwrap();let token=result["token"].as_str().unwrap();
        let second=store.save(token,&b).unwrap();
        assert_eq!(read_bounded(&p,DOCUMENT_LIMIT).unwrap(),b.as_bytes());
        assert_eq!(read_bounded(Path::new(second["backup"].as_str().unwrap()),DOCUMENT_LIMIT).unwrap(),a.as_bytes());
        fs::remove_dir_all(d).unwrap();
    }
    #[test] fn changed_deleted_or_unknown_target_is_not_overwritten(){
        let d=dir();let mut s=FileStore::new(d.join("app")).unwrap();let p=d.join("x.sg.json");let a=doc("ACGT");
        let r=s.save_to(&p,&a,None,None).unwrap();let t=r["token"].as_str().unwrap();
        fs::write(&p,b"external").unwrap();assert!(s.save(t,&a).is_err());assert_eq!(fs::read(&p).unwrap(),b"external");
        fs::remove_file(&p).unwrap();assert!(s.save(t,&a).is_err());assert!(s.save("bad",&a).is_err());assert!(!p.exists());fs::remove_dir_all(d).unwrap();
    }
    #[test] fn invalid_json_and_imported_sources_are_protected(){
        let d=dir();let mut s=FileStore::new(d.join("app")).unwrap();let p=d.join("x.gb");fs::write(&p,b"source").unwrap();
        let r=s.open(&p).unwrap();assert!(s.save(r["token"].as_str().unwrap(),&doc("ACGT")).is_err());
        s.grants.remove(r["token"].as_str().unwrap());
        assert!(s.export(&p,b"changed",Some(&hash(b"source"))).is_err());
        assert!(s.save_to(&d.join("new.sg.json"),"{}",None,None).is_err());assert_eq!(fs::read(&p).unwrap(),b"source");fs::remove_dir_all(d).unwrap();
    }
    #[test] fn interruption_before_commit_keeps_original_and_cleans_temp(){
        let d=dir();let p=d.join("x");fs::write(&p,b"old").unwrap();let h=hash(b"old");
        assert!(replace_checked(&p,b"new",Some(&h),100,||Err("injected write failure".into())).is_err());
        assert_eq!(fs::read(&p).unwrap(),b"old");assert!(fs::read_dir(&d).unwrap().all(|f|!f.unwrap().file_name().to_string_lossy().ends_with(".tmp")));fs::remove_dir_all(d).unwrap();
    }
    #[test] fn concurrent_creation_is_not_clobbered(){
        let d=dir();let p=d.join("x");
        assert!(replace_checked(&p,b"ours",None,100,||{fs::write(&p,b"other").unwrap();Ok(())}).is_err());
        assert_eq!(fs::read(&p).unwrap(),b"other");fs::remove_dir_all(d).unwrap();
    }
    #[test] fn readonly_destination_is_not_replaced(){
        let d=dir();let p=d.join("readonly");fs::write(&p,b"old").unwrap();
        let original=fs::metadata(&p).unwrap().permissions();
        let mut readonly=original.clone();readonly.set_readonly(true);fs::set_permissions(&p,readonly).unwrap();
        assert!(replace(&p,b"new",Some(&hash(b"old")),100).is_err());
        assert_eq!(fs::read(&p).unwrap(),b"old");fs::set_permissions(&p,original).unwrap();fs::remove_dir_all(d).unwrap();
    }
    #[test] fn advisory_lock_refuses_concurrent_writer(){
        let d=dir();let p=d.join("x");let lock=lock_path(&p).unwrap();assert!(lock_path(&p).is_err());drop(lock);assert!(lock_path(&p).is_ok());fs::remove_dir_all(d).unwrap();
    }
    #[test] fn recovery_is_bounded_versioned_and_keeps_predecessor(){
        let d=dir();let s=FileStore::new(d.join("app")).unwrap();let a=json!({"version":1,"documents":[],"savedAt":"2026-10-13","activeIndex":-1}).to_string();
        assert_eq!(s.write_recovery(Some(&a),0).unwrap(),1);assert!(s.write_recovery(Some(&a),0).is_err());
        let b=a.replace("2026-10-13","2026-10-14");s.write_recovery(Some(&b),1).unwrap();
        let r=s.recovery().unwrap();assert_eq!(r["previous"],a);assert_eq!(r["current"],b);
        s.write_recovery(None,2).unwrap();assert_eq!(s.recovery().unwrap()["enabled"],false);fs::remove_dir_all(d).unwrap();
    }
    #[cfg(unix)]
    #[test] fn symlink_targets_are_refused(){
        let d=dir();let p=d.join("real");fs::write(&p,b"private").unwrap();let link=d.join("alias");std::os::unix::fs::symlink(&p,&link).unwrap();
        assert!(read_bounded(&link,100).is_err());assert!(replace(&link,b"bad",Some(&hash(b"private")),100).is_err());assert_eq!(fs::read(p).unwrap(),b"private");fs::remove_dir_all(d).unwrap();
    }
}

#[cfg(test)]
#[path = "file_safety_tests.rs"]
mod file_safety_tests;

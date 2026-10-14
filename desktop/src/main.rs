#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]
//! Native desktop shell; no duplicate scientific engine and no shell/HTTP plugin.
mod files;
use base64::{Engine, engine::general_purpose::STANDARD};
use files::{FileStore, Result};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
struct Host {
    files: Mutex<FileStore>,
    busy: AtomicBool,
    exiting: AtomicBool,
    probe: bool,
    #[cfg(feature="io-test")] test: bool,
}
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> { fn drop(&mut self) { self.0.store(false,Ordering::SeqCst); } }
fn begin(host:&Host)->Result<Busy<'_>> {
    if host.probe {return Err("File commands are disabled in diagnostic mode".into());}
    host.busy.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).map_err(|_|"Another native file operation is active")?;
    Ok(Busy(&host.busy))
}
fn paths(app:&tauri::AppHandle, save:bool, name:&str)->Result<Option<PathBuf>>{
    #[cfg(feature="io-test")]
    {
        let state=app.state::<Host>();
        if state.test {
            let dir=state.files.lock().map_err(|_|"File service unavailable")?.data_dir.clone();
            let control=dir.join("test-pick.txt");
            let text=std::fs::read_to_string(&control).unwrap_or_default();
            let _=std::fs::remove_file(control);
            if text=="cancel"{return Ok(None);}
            let allowed=if save{["first.sg.json","second.sg.json","report.fasta","report.gb","invalid.sg.json"].as_slice()}else{["first.sg.json","source.fa"].as_slice()};
            if !allowed.contains(&text.as_str()){return Err("Test picker only accepts predefined fixture filenames".into());}
            return Ok(Some(dir.join(text)));
        }
    }
    let dialog=app.dialog().file();
    let picked=if save{dialog.set_file_name(name).blocking_save_file()}
        else{dialog.add_filter("Sequence documents",&["json","dna","gb","gbk","genbank","embl","txt","fa","fasta","fna"]).blocking_pick_file()};
    picked.map(|p|p.into_path().map_err(|e|e.to_string())).transpose()
}
fn confirm_replace(app:&tauri::AppHandle,path:&std::path::Path,native_document:bool)->bool{
    #[cfg(feature="io-test")] if app.state::<Host>().test{return true;}
    let backup_notice=if native_document {
        "A previous native document copy will be kept in the application data directory."
    } else {
        "Generic exports do not keep an automatic predecessor backup. Choose another name to preserve the existing file."
    };
    app.dialog().message(format!("Replace “{}”? {backup_notice} External changes detected during this operation will cancel it.",path.file_name().unwrap_or_default().to_string_lossy()))
        .title("Confirm file replacement").buttons(MessageDialogButtons::OkCancel).blocking_show()
}
#[tauri::command]
async fn desktop_open(app:tauri::AppHandle,state:tauri::State<'_,Host>)->Result<Option<Value>>{
    let _busy=begin(&state)?;
    let Some(path)=paths(&app,false,"")? else{return Ok(None)};
    let result=state.files.lock().map_err(|_|"File service unavailable")?.open(&path)?;
    Ok(Some(result))
}
#[tauri::command]
async fn desktop_save(app:tauri::AppHandle,state:tauri::State<'_,Host>,token:Option<String>,text:String,name:String)->Result<Option<Value>>{
    let _busy=begin(&state)?;
    files::check_document(text.as_bytes())?;
    if let Some(token)=token {
        return Ok(Some(state.files.lock().map_err(|_|"File service unavailable")?.save(&token,&text)?));
    }
    let safe=name.chars().filter(|c|c.is_ascii_alphanumeric()||"._-".contains(*c)).take(100).collect::<String>();
    let Some(path)=paths(&app,true,&format!("{}.sg.json",if safe.is_empty(){"sequence"}else{&safe}))? else{return Ok(None)};
    let path=files::checked_path(&path)?;
    let expected=files::snapshot(&path,files::DOCUMENT_LIMIT)?;
    if expected.is_some()&&!confirm_replace(&app,&path,true){return Ok(None);}
    let result=state.files.lock().map_err(|_|"File service unavailable")?.save_to(&path,&text,expected.as_deref(),None)?;
    Ok(Some(result))
}
#[tauri::command]
async fn desktop_export(app:tauri::AppHandle,state:tauri::State<'_,Host>,name:String,base64:String)->Result<Option<Value>>{
    let _busy=begin(&state)?;
    let extension=name.rsplit('.').next().ok_or("Missing export extension")?.to_lowercase();
    if name.len()>160||name.contains(['/', '\\'])||!["json","gb","embl","fasta","fa","dna","svg","png","txt"].contains(&extension.as_str())||name.to_lowercase().ends_with(".sg.json"){
        return Err("Unsupported export name/format. Native documents use Save As.".into());
    }
    if base64.len()>files::EXPORT_LIMIT*4/3+4{return Err("Export exceeds 16 MB".into());}
    let bytes=STANDARD.decode(base64).map_err(|_|"Invalid export encoding")?;
    let Some(path)=paths(&app,true,&name)? else{return Ok(None)};
    if path.extension().and_then(|s|s.to_str()).map(str::to_lowercase).as_deref()!=Some(&extension){return Err(format!("Keep the .{extension} extension for this export."));}
    let path=files::checked_path(&path)?;
    let expected=files::snapshot(&path,files::EXPORT_LIMIT)?;
    if expected.is_some()&&!confirm_replace(&app,&path,false){return Ok(None);}
    Ok(Some(state.files.lock().map_err(|_|"File service unavailable")?.export(&path,&bytes,expected.as_deref())?))
}
#[tauri::command]
fn desktop_release(state:tauri::State<'_,Host>,token:String)->Result<()>{
    state.files.lock().map_err(|_|"File service unavailable")?.grants.remove(&token);Ok(())
}
#[tauri::command]
async fn desktop_recovery_read(state:tauri::State<'_,Host>)->Result<Value>{
    if state.probe{return Err("Recovery is disabled in diagnostic mode".into());}
    state.files.lock().map_err(|_|"File service unavailable")?.recovery()
}
#[tauri::command]
async fn desktop_recovery_write(state:tauri::State<'_,Host>,text:Option<String>,expected:u64)->Result<u64>{
    if state.probe{return Err("Recovery is disabled in diagnostic mode".into());}
    state.files.lock().map_err(|_|"File service unavailable")?.write_recovery(text.as_deref(),expected)
}
#[tauri::command]
fn desktop_close(app:tauri::AppHandle,state:tauri::State<'_,Host>)->Result<()>{
    if state.busy.load(Ordering::SeqCst){return Err("A file operation is still active. Finish it before quitting.".into());}
    state.exiting.store(true,Ordering::SeqCst);app.exit(0);Ok(())
}
#[tauri::command]
fn desktop_info(state:tauri::State<'_,Host>)->Result<Value>{
    let files=state.files.lock().map_err(|_|"File service unavailable")?;
    Ok(json!({"version":"0.8.4","dataDirectory":files.data_dir.to_string_lossy(),"signing":"Development preview; not Developer-ID notarized","scientificEngine":"TypeScript"}))
}
#[tauri::command]
fn probe_report(app:tauri::AppHandle,state:tauri::State<'_,Host>,report:Value)->Result<()>{
    if !state.probe {return Err("Report command disabled outside --probe".into());}
    let text=report.to_string();if text.len()>16384||!report.is_object(){return Err("Invalid diagnostic report".into());}
    let ok=report["success"]==true&&report["cases"].as_array().is_some_and(|v|v.len()==2);
    println!("GIN_SCHNAPS_PROBE_REPORT={text}");state.exiting.store(true,Ordering::SeqCst);app.exit(if ok{0}else{1});Ok(())
}
#[cfg(feature="io-test")]
#[tauri::command]
fn io_test_control(app:tauri::AppHandle,state:tauri::State<'_,Host>,action:String,value:Option<String>)->Result<Value>{
    if !state.test{return Err("Test control is not enabled".into());}
    let dir=state.files.lock().map_err(|_|"File service unavailable")?.data_dir.clone();
    match action.as_str(){
        "pick"=>{let v=value.ok_or("Expected fixture name")?;if !["first.sg.json","second.sg.json","invalid.sg.json","report.fasta","report.gb","source.fa","cancel"].contains(&v.as_str()){return Err("Invalid fixture".into());}std::fs::write(dir.join("test-pick.txt"),v).map_err(|e|e.to_string())?;Ok(Value::Null)}
        "external-change"=>{std::fs::write(dir.join("first.sg.json"),"external-writer").map_err(|e|e.to_string())?;Ok(Value::Null)}
        "stage"=>{let p=dir.join("test-stage");if let Some(v)=value{if v!="restoring"{return Err("Invalid phase".into());}std::fs::write(&p,&v).map_err(|e|e.to_string())?;}Ok(json!(std::fs::read_to_string(p).unwrap_or_default()))}
        "read-recovery"=>Ok(state.files.lock().map_err(|_|"File service unavailable")?.recovery()?),
        "read-report"=>Ok(json!(std::fs::read_to_string(dir.join("report.gb")).map_err(|e|e.to_string())?)),
        "read-source"=>Ok(json!(std::fs::read_to_string(dir.join("source.fa")).map_err(|e|e.to_string())?)),
        "read-backup"=>{let p=files::checked_path(&dir.join("first.sg.json"))?;let backup=dir.join("backups").join(format!("{}.sg.json",files::hash(p.to_string_lossy().as_bytes())));Ok(json!(std::fs::read_to_string(backup).map_err(|e|e.to_string())?))}
        "read-first"=>Ok(json!(String::from_utf8(files::read_bounded(&dir.join("first.sg.json"),files::DOCUMENT_LIMIT)?).map_err(|e|e.to_string())?)),
        "read-second"=>Ok(json!(String::from_utf8(files::read_bounded(&dir.join("second.sg.json"),files::DOCUMENT_LIMIT)?).map_err(|e|e.to_string())?)),
        "close-request"=>{send_action(&app,"quit");Ok(Value::Null)}
        "report"=>{let text=value.ok_or("Missing report")?;if text.len()>16000{return Err("Oversized report".into());}let r:Value=serde_json::from_str(&text).map_err(|e|e.to_string())?;println!("GIN_SCHNAPS_IO_REPORT={r}");if r["success"]!=true{state.exiting.store(true,Ordering::SeqCst);app.exit(1);}Ok(Value::Null)}
        _=>Err("Unknown test command".into())
    }
}
fn send_action(app:&tauri::AppHandle,action:&str){
    // Only fixed menu identifiers originate here; no data-dependent evaluation.
    if let Some(w)=app.get_webview_window("main"){
        if let Ok(payload)=serde_json::to_string(action){
            let _=w.eval(&format!("window.dispatchEvent(new CustomEvent('gin-schnaps-native-action',{{detail:{payload}}}));"));
        }
    }
}
fn menu(app:&tauri::App)->tauri::Result<()>{
    use tauri::menu::{Menu,MenuItem,Submenu,PredefinedMenuItem};
    let quit=MenuItem::with_id(app,"quit","Quit Gin Schnaps",true,Some("CmdOrCtrl+Q"))?;
    let about=Submenu::with_items(app,"Gin Schnaps",true,&[&quit])?;
    let new=MenuItem::with_id(app,"new","New",true,None::<&str>)?;
    let open=MenuItem::with_id(app,"open","Open…",true,None::<&str>)?;
    let save=MenuItem::with_id(app,"save","Save",true,None::<&str>)?;
    let save_as=MenuItem::with_id(app,"save-as","Save As…",true,None::<&str>)?;
    let file=Submenu::with_items(app,"File",true,&[&new,&open,&save,&save_as])?;
    let copy=PredefinedMenuItem::copy(app,None)?;let cut=PredefinedMenuItem::cut(app,None)?;let paste=PredefinedMenuItem::paste(app,None)?;
    let undo=MenuItem::with_id(app,"undo","Undo",true,None::<&str>)?;
    let redo=MenuItem::with_id(app,"redo","Redo",true,None::<&str>)?;
    let all=MenuItem::with_id(app,"select-all","Select All",true,None::<&str>)?;
    let edit=Submenu::with_items(app,"Edit",true,&[&undo,&redo,&cut,&copy,&paste,&all])?;
    app.set_menu(Menu::with_items(app,&[&about,&file,&edit])?)?;Ok(())
}
fn main(){
    let probe=std::env::args().any(|arg|arg=="--probe");
    #[cfg(feature="io-test")] let test=std::env::args().any(|arg|arg=="--io-test");
    let builder=tauri::Builder::default().plugin(tauri_plugin_dialog::init());
    #[cfg(feature="io-test")]
    let builder=builder.invoke_handler(tauri::generate_handler![desktop_open,desktop_save,desktop_export,desktop_release,desktop_info,desktop_recovery_read,desktop_recovery_write,desktop_close,probe_report,io_test_control]);
    #[cfg(not(feature="io-test"))]
    let builder=builder.invoke_handler(tauri::generate_handler![desktop_open,desktop_save,desktop_export,desktop_release,desktop_info,desktop_recovery_read,desktop_recovery_write,desktop_close,probe_report]);
    let app=builder.setup(move |app|{
        let data_dir=if probe {std::env::temp_dir().join(format!("gin-schnaps-probe-{}",uuid::Uuid::new_v4()))}else{app.path().app_data_dir()?};
        #[cfg(feature="io-test")] let data_dir=if test{std::env::temp_dir().join(format!("gin-schnaps-io-test-{}",uuid::Uuid::new_v4()))}else{data_dir};
        let store=FileStore::new(data_dir).map_err(std::io::Error::other)?;
        #[cfg(feature="io-test")] if test{std::fs::write(store.data_dir.join("source.fa"),">source\nACGTACGT\n")?;}
        app.manage(Host{files:Mutex::new(store),busy:AtomicBool::new(false),exiting:AtomicBool::new(false),probe,#[cfg(feature="io-test")]test});
        let page=if probe{"diagnostic.html"}else{"index.html"};
        let mut window=WebviewWindowBuilder::new(app,"main",WebviewUrl::App(page.into()))
            .title("Gin Schnaps").inner_size(1280.,800.).min_inner_size(1024.,640.)
            .on_navigation(|url|(url.scheme()=="tauri"&&url.host_str()==Some("localhost"))||(url.scheme()=="http"&&url.host_str()==Some("tauri.localhost")));
        if probe {window=window.initialization_script("window.__GIN_SCHNAPS_AUTORUN_DIAGNOSTIC__=true;");}
        #[cfg(feature="io-test")] if test {window=window.initialization_script(concat!("window.__GIN_SCHNAPS_NATIVE_TEST__=true;\n",include_str!("../../tests/native-io-driver.js")));}
        window.build()?;
        if !probe{menu(app)?;}
        #[cfg(feature="io-test")] let timed=probe||test;
        #[cfg(not(feature="io-test"))] let timed=probe;
        if timed{let handle=app.handle().clone();std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(180));eprintln!("Native test timed out");handle.state::<Host>().exiting.store(true,Ordering::SeqCst);handle.exit(2);});}
        Ok(())
    }).on_menu_event(|app,event|{send_action(app,event.id().as_ref());})
    .on_window_event(|window,event|{
        if let tauri::WindowEvent::CloseRequested{api,..}=event {
            if !window.state::<Host>().exiting.load(Ordering::SeqCst){api.prevent_close();send_action(window.app_handle(),"quit");}
        }
    }).build(tauri::generate_context!()).expect("Cannot start Gin Schnaps");
    app.run(|app,event|{
        if let tauri::RunEvent::ExitRequested{api,..}=event {
            if !app.state::<Host>().exiting.load(Ordering::SeqCst){api.prevent_exit();send_action(app,"quit");}
        }
    });
}

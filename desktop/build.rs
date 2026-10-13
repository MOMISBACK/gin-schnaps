fn main() {
 let attributes = tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["probe_report", "desktop_open", "desktop_save", "desktop_export", "desktop_release", "desktop_info", "desktop_recovery_read", "desktop_recovery_write", "desktop_close", "io_test_control"]));
 tauri_build::try_build(attributes).expect("Tauri build configuration failed");
}

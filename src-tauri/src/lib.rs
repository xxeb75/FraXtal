/// Resolves the bundled ffmpeg sidecar's absolute path so other sidecars
/// (yt-dlp, via --ffmpeg-location) can find it without relying on system
/// PATH. Bundled builds place sidecars next to the app executable; dev
/// builds fall back to the source binaries/ folder.
#[tauri::command]
fn ffmpeg_sidecar_path() -> Result<String, String> {
  const NAME: &str = "ffmpeg-x86_64-pc-windows-msvc.exe";
  let exe = std::env::current_exe().map_err(|e| e.to_string())?;
  if let Some(dir) = exe.parent() {
    let candidate = dir.join(NAME);
    if candidate.exists() {
      return Ok(candidate.to_string_lossy().to_string());
    }
  }
  let dev_candidate = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries").join(NAME);
  Ok(dev_candidate.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![ffmpeg_sidecar_path])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

mod backend;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Native commands ported from the Python server (step 2.3). The UI invokes
    // these in the desktop shell; the web preview still uses HTTP fetch.
    .invoke_handler(tauri::generate_handler![
      backend::health,
      backend::presets_list,
      backend::presets_get,
      backend::presets_save,
      backend::presets_delete,
      backend::quickpresets_list,
      backend::quickpresets_get,
      backend::quickpresets_save,
      backend::quickpresets_delete,
      backend::browse,
      backend::monitors,
      backend::launch,
      backend::presets_run,
      backend::quickpresets_run,
      backend::snap_popup,
      backend::list_browsers,
    ])
    // Single-instance must be registered FIRST: a second launch of InstaDesk
    // focuses the already-running window instead of spawning another copy.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      use tauri::Manager;
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    // Persist & restore the window's size and position across launches.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Track the last-focused non-InstaDesk window so Snap targets it.
      backend::start_foreground_tracker();
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

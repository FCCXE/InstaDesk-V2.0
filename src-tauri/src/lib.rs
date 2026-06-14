mod backend;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// Bring the main window to the foreground (used by the tray click + menu).
fn focus_main(app: &AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

/// Build the InstaDesk system-tray icon with a Show/Quit menu.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
  let show = MenuItem::with_id(app, "show", "Show InstaDesk", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "Quit InstaDesk", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&show, &quit])?;

  let mut builder = TrayIconBuilder::with_id("main")
    .tooltip("InstaDesk")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
      "show" => focus_main(app),
      "quit" => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        focus_main(tray.app_handle());
      }
    });
  // Use the app's window icon (the InstaDesk emblem) as the tray image.
  if let Some(icon) = app.default_window_icon().cloned() {
    builder = builder.icon(icon);
  }
  builder.build(app)?;
  Ok(())
}

/// Initialize native (Rust) crash reporting. RELEASE builds only — we don't ship
/// dev-session panics to the dashboard. The DSN (a public client key) is baked in
/// at build time by build.rs from the git-ignored ui/.env; absent/empty disables
/// it. Honors the telemetry opt-out marker the UI writes (set_telemetry_optout),
/// so opting out silences native crash reporting on the next launch too. The
/// returned guard must be held for the app's lifetime (held in main()).
pub fn init_sentry() -> Option<sentry::ClientInitGuard> {
  if cfg!(debug_assertions) {
    return None;
  }
  let dsn = option_env!("SENTRY_DSN")?;
  if dsn.is_empty() || telemetry_opted_out() {
    return None;
  }
  Some(sentry::init((
    dsn,
    sentry::ClientOptions {
      release: sentry::release_name!(),
      ..Default::default()
    },
  )))
}

/// True if the user opted out of telemetry. Read from %APPDATA% directly because
/// this runs in main(), before the Tauri path resolver exists; the path matches
/// Tauri's app_data_dir() (roaming AppData + the bundle identifier).
fn telemetry_opted_out() -> bool {
  std::env::var("APPDATA")
    .map(|a| {
      std::path::Path::new(&a)
        .join("com.fcxestudios.instadesk")
        .join(".telemetry-optout")
        .exists()
    })
    .unwrap_or(false)
}

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
      backend::pick_exe,
      backend::open_manual,
      backend::autostart_is_enabled,
      backend::autostart_set,
      backend::set_telemetry_optout,
    ])
    // Launch-on-system-start support (the Settings → General toggle drives this
    // through backend::autostart_set / _is_enabled).
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ))
    // Signed auto-updater + process (relaunch after applying an update). The UI
    // drives the check/download/install + restart flow.
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    // Single-instance must be registered FIRST: a second launch of InstaDesk
    // focuses the already-running window instead of spawning another copy.
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
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
      // Resolve the bundled agent / manuals / app-data paths once (production);
      // dev runs fall through to the dev-tree fallbacks.
      backend::init_paths(app.handle());
      // Track the last-focused non-InstaDesk window so Snap targets it.
      backend::start_foreground_tracker();
      // Launch-on-start defaults ON the first time the packaged app runs; the
      // user can turn it off in Settings and that choice is respected after.
      backend::ensure_autostart_default(app.handle());
      // System-tray icon (InstaDesk emblem): left-click shows/focuses the window;
      // the menu offers Show + Quit. Closing the window still exits the app (we
      // don't hide-to-tray) — this just gives InstaDesk a visible tray presence.
      build_tray(app.handle())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

mod backend;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

/// Bring the main window to the foreground (used by the tray click + menu + the
/// Show-Dashboard global hotkey).
fn focus_main(app: &AppHandle) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

// Default global hotkeys (system-wide). Ctrl+Alt+D = show the dashboard;
// Ctrl+Alt+S = open Snap on the active monitor. (Rebinding is a later feature.)
fn hotkey_show() -> Shortcut {
  Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyD)
}
fn hotkey_snap() -> Shortcut {
  Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyS)
}

// Ctrl+Alt+1..9 → apply Quick Preset slot A..I. Returns the slot letter for a
// matching shortcut, else None.
fn quickpreset_slot_for(shortcut: &Shortcut) -> Option<char> {
  if !shortcut.mods.contains(Modifiers::CONTROL | Modifiers::ALT) {
    return None;
  }
  let n: u8 = match shortcut.key {
    Code::Digit1 => 0,
    Code::Digit2 => 1,
    Code::Digit3 => 2,
    Code::Digit4 => 3,
    Code::Digit5 => 4,
    Code::Digit6 => 5,
    Code::Digit7 => 6,
    Code::Digit8 => 7,
    Code::Digit9 => 8,
    _ => return None,
  };
  Some((b'A' + n) as char)
}

const QUICKPRESET_DIGITS: [Code; 9] = [
  Code::Digit1,
  Code::Digit2,
  Code::Digit3,
  Code::Digit4,
  Code::Digit5,
  Code::Digit6,
  Code::Digit7,
  Code::Digit8,
  Code::Digit9,
];

// Current (possibly user-rebound) Show / Snap hotkeys. Default to hotkey_show/snap;
// the Settings rebinder updates them via set_hotkey. The QP digits stay fixed.
static SHOW_HOTKEY: std::sync::LazyLock<std::sync::Mutex<Shortcut>> =
  std::sync::LazyLock::new(|| std::sync::Mutex::new(hotkey_show()));
static SNAP_HOTKEY: std::sync::LazyLock<std::sync::Mutex<Shortcut>> =
  std::sync::LazyLock::new(|| std::sync::Mutex::new(hotkey_snap()));

/// Build a Shortcut from JS-supplied parts (e.code + modifier booleans). None if
/// the code isn't a known key.
fn shortcut_from_parts(ctrl: bool, alt: bool, shift: bool, sup: bool, code: &str) -> Option<Shortcut> {
  let mut mods = Modifiers::empty();
  if ctrl {
    mods |= Modifiers::CONTROL;
  }
  if alt {
    mods |= Modifiers::ALT;
  }
  if shift {
    mods |= Modifiers::SHIFT;
  }
  if sup {
    mods |= Modifiers::SUPER;
  }
  let key: Code = code.parse().ok()?;
  Some(Shortcut::new(
    if mods.is_empty() { None } else { Some(mods) },
    key,
  ))
}

/// Rebind the Show or Snap global hotkey (called by Settings). Registers the new
/// combo first (so a conflict leaves the old one working), then drops the old.
#[tauri::command]
fn set_hotkey(
  app: AppHandle,
  action: String,
  ctrl: bool,
  alt: bool,
  shift: bool,
  sup: bool,
  code: String,
) -> Result<(), String> {
  let new_sc =
    shortcut_from_parts(ctrl, alt, shift, sup, &code).ok_or_else(|| format!("Unknown key: {code}"))?;
  let slot = match action.as_str() {
    "show" => &SHOW_HOTKEY,
    "snap" => &SNAP_HOTKEY,
    _ => return Err(format!("Unknown action: {action}")),
  };
  let mut cur = slot.lock().map_err(|_| "lock".to_string())?;
  if new_sc == *cur {
    return Ok(());
  }
  let gs = app.global_shortcut();
  gs.register(new_sc)
    .map_err(|e| format!("That combination may already be in use ({e})."))?;
  let _ = gs.unregister(*cur);
  *cur = new_sc;
  Ok(())
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
      backend::get_dragsnap_enabled,
      backend::set_dragsnap_enabled,
      set_hotkey,
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
    // Global hotkeys — trigger InstaDesk from any app. Show-dashboard focuses the
    // window (native); Snap emits to the UI, which runs it with the current
    // monitor/grid + the foreground-tracked target window.
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
          use tauri_plugin_global_shortcut::ShortcutState;
          if event.state() != ShortcutState::Pressed {
            return;
          }
          if SHOW_HOTKEY.lock().map(|s| shortcut == &*s).unwrap_or(false) {
            focus_main(app);
          } else if SNAP_HOTKEY.lock().map(|s| shortcut == &*s).unwrap_or(false) {
            let _ = app.emit("insta://hotkey/snap", ());
          } else if let Some(slot) = quickpreset_slot_for(shortcut) {
            let _ = app.emit("insta://hotkey/quickpreset", slot.to_string());
          }
        })
        .build(),
    )
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
      // Drag-to-snap: load the saved preference, then start the move/size hook
      // (Shift + drag a window, release → snap to the zone under the cursor).
      backend::init_dragsnap_enabled(app.handle());
      backend::start_dragsnap_hook();
      // Launch-on-start defaults ON the first time the packaged app runs; the
      // user can turn it off in Settings and that choice is respected after.
      backend::ensure_autostart_default(app.handle());
      // System-tray icon (InstaDesk emblem): left-click shows/focuses the window;
      // the menu offers Show + Quit. Closing the window still exits the app (we
      // don't hide-to-tray) — this just gives InstaDesk a visible tray presence.
      build_tray(app.handle())?;
      // Register the default global hotkeys. Failures (e.g. a key already claimed
      // by another app) are ignored so startup never breaks.
      let gs = app.global_shortcut();
      if let Ok(s) = SHOW_HOTKEY.lock() {
        let _ = gs.register(*s);
      }
      if let Ok(s) = SNAP_HOTKEY.lock() {
        let _ = gs.register(*s);
      }
      for code in QUICKPRESET_DIGITS {
        let _ = gs.register(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code));
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

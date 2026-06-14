// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Hold the Sentry guard for the whole process lifetime (flushes on exit).
  // No-op in dev / without a DSN / when the user opted out.
  let _sentry = app_lib::init_sentry();
  app_lib::run();
}

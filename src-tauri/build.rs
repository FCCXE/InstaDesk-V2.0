use std::fs;
use std::path::Path;

fn main() {
  // Bake the Sentry DSN (a PUBLIC client key) into the binary from the git-ignored
  // ui/.env, so Rust-side crash reporting targets the same Sentry project as the UI
  // without hardcoding the DSN in source. Absent/empty -> SENTRY_DSN unset ->
  // Rust telemetry stays off. Re-run when the .env changes.
  println!("cargo:rerun-if-changed=../ui/.env");
  if let Ok(contents) = fs::read_to_string(Path::new("../ui/.env")) {
    for line in contents.lines() {
      if let Some(rest) = line.trim().strip_prefix("VITE_SENTRY_DSN=") {
        let dsn = rest.trim().trim_matches('"');
        if !dsn.is_empty() {
          println!("cargo:rustc-env=SENTRY_DSN={dsn}");
        }
      }
    }
  }

  tauri_build::build()
}

//! Backend commands ported from the Python FastAPI server (`server/main.py`)
//! into native Rust (Phase-2 step 2.3, Option B). The UI calls these via
//! Tauri `invoke` instead of HTTP `fetch`; the C# WinAgent stays the worker.
//! As endpoints land here one-by-one, the Python server is retired.

use serde::Serialize;
use std::path::PathBuf;

/// Mirror of the UI's `HealthResponse` (ui/src/services/api.ts). `rename_all`
/// makes the JSON fields camelCase so they match the TS type exactly.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub ok: bool,
    pub agent_path: String,
    pub agent_exists: bool,
    pub mode: String,
    pub timeout_sec: u32,
    pub cors: Vec<String>,
    pub data_dir: String,
}

/// Find the outer InstaDesk repo root by walking up from the running executable
/// to the first ancestor that contains the WinAgent DLL. This is the dev/bridge
/// resolution that mirrors the Python server's `ROOT.parent`; step 2.4 replaces
/// it with a bundled-sidecar agent path + the OS app-data dir for production.
fn outer_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    for anc in exe.ancestors() {
        let dll = anc
            .join("winagent")
            .join("InstaDesk.WinAgent")
            .join("publish")
            .join("dll")
            .join("InstaDesk.WinAgent.dll");
        if dll.exists() {
            return Some(anc.to_path_buf());
        }
    }
    None
}

/// `GET /health` — ported to Rust. Returns the same shape the FastAPI server
/// returned, so the UI's server-status indicator works unchanged. Honors the
/// same env overrides as the server (`AGENT_PATH`, plus `INSTADESK_DATA_DIR`).
#[tauri::command]
pub fn health() -> HealthResponse {
    let root = outer_root();

    let agent_path: PathBuf = std::env::var_os("AGENT_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            root.clone()
                .unwrap_or_default()
                .join("winagent")
                .join("InstaDesk.WinAgent")
                .join("publish")
                .join("dll")
                .join("InstaDesk.WinAgent.dll")
        });

    let data_dir: PathBuf = std::env::var_os("INSTADESK_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.unwrap_or_default().join("data"));

    HealthResponse {
        ok: true,
        agent_exists: agent_path.exists(),
        agent_path: agent_path.to_string_lossy().into_owned(),
        mode: "dll".into(),
        timeout_sec: 45,
        cors: Vec::new(),
        data_dir: data_dir.to_string_lossy().into_owned(),
    }
}

//! Backend commands ported from the Python FastAPI server (`server/main.py`)
//! into native Rust (Phase-2 step 2.3, Option B). The UI calls these via
//! Tauri `invoke` instead of HTTP `fetch`; the C# WinAgent stays the worker.
//! As endpoints land here one-by-one, the Python server is retired.

use chrono::{DateTime, Local, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

// ----------------------------------------------------------------------------
// Shared storage helpers — mirror the Python server's DATA_DIR layout exactly,
// so the Rust commands read/write the SAME files (existing presets keep working).
//   DATA_DIR        = <outer repo>/data        (env INSTADESK_DATA_DIR overrides)
//   presets         = DATA_DIR/presets/{kind}_{SLOT}.json
//   quick presets   = DATA_DIR/quickpresets/QP_{SLOT}.json
// ----------------------------------------------------------------------------

fn data_dir() -> PathBuf {
    if let Some(d) = std::env::var_os("INSTADESK_DATA_DIR") {
        return PathBuf::from(d);
    }
    outer_root().unwrap_or_default().join("data")
}

fn presets_dir() -> PathBuf {
    data_dir().join("presets")
}

fn quickpresets_dir() -> PathBuf {
    data_dir().join("quickpresets")
}

/// Path to the C# WinAgent DLL (the worker the agent-invoking commands shell out
/// to via `dotnet`). `AGENT_PATH` env overrides, matching the Python server.
/// Step 2.4 swaps this for the bundled self-contained sidecar exe.
fn agent_path() -> PathBuf {
    std::env::var_os("AGENT_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            outer_root()
                .unwrap_or_default()
                .join("winagent")
                .join("InstaDesk.WinAgent")
                .join("publish")
                .join("dll")
                .join("InstaDesk.WinAgent.dll")
        })
}

/// File mtime as an ISO-8601 (RFC3339, local tz) string — matches the Python
/// `datetime.fromtimestamp(mtime).isoformat()` for the UI's `updatedAt`.
fn mtime_iso(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| DateTime::<Utc>::from(t).with_timezone(&Local).to_rfc3339())
        .unwrap_or_default()
}

/// Recover (kind, SLOT) from a preset filename stem `{general|single}_{A}`.
fn derive_from_filename(stem: &str) -> Option<(String, String)> {
    let (kind, slot) = stem.split_once('_')?;
    let c = slot.chars().next()?;
    if (kind == "general" || kind == "single") && slot.len() == 1 && c.is_ascii_alphabetic() {
        Some((kind.to_string(), slot.to_uppercase()))
    } else {
        None
    }
}

/// Expand Windows `%VAR%` references (mirrors the server's `os.path.expandvars`).
fn expand_env_vars(input: &str) -> String {
    let mut out = String::new();
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        let mut name = String::new();
        let mut closed = false;
        while let Some(&nc) = chars.peek() {
            chars.next();
            if nc == '%' {
                closed = true;
                break;
            }
            name.push(nc);
        }
        match (closed, std::env::var(&name)) {
            (true, Ok(val)) => out.push_str(&val),
            (true, Err(_)) => {
                out.push('%');
                out.push_str(&name);
                out.push('%');
            }
            (false, _) => {
                out.push('%');
                out.push_str(&name);
            }
        }
    }
    out
}

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
    let agent = agent_path();
    let dir = data_dir();
    HealthResponse {
        ok: true,
        agent_exists: agent.exists(),
        agent_path: agent.to_string_lossy().into_owned(),
        mode: "dll".into(),
        timeout_sec: 45,
        cors: Vec::new(),
        data_dir: dir.to_string_lossy().into_owned(),
    }
}

// ----------------------------------------------------------------------------
// Presets — saved Layouts. File-only; mirrors /presets/* on the Python server.
// ----------------------------------------------------------------------------

/// `GET /presets/list`
#[tauri::command]
pub fn presets_list() -> Result<Value, String> {
    let mut items: Vec<Value> = Vec::new();
    if let Ok(rd) = fs::read_dir(presets_dir()) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let raw: Value = match fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
            {
                Some(v) => v,
                None => continue,
            };
            let mut kind = raw.get("kind").and_then(|v| v.as_str()).map(String::from);
            let mut slot = raw.get("slot").and_then(|v| v.as_str()).map(String::from);
            if kind.is_none() || slot.is_none() {
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if let Some((fk, fs_)) = derive_from_filename(stem) {
                    kind = kind.or(Some(fk));
                    slot = slot.or(Some(fs_));
                }
            }
            let (kind, slot) = match (kind, slot) {
                (Some(k), Some(s)) => (k, s),
                _ => continue,
            };
            items.push(json!({
                "kind": kind,
                "slot": slot.to_uppercase(),
                "path": path.to_string_lossy(),
                "updatedAt": mtime_iso(&path),
            }));
        }
    }
    items.sort_by(|a, b| {
        let ka = (a["kind"].as_str().unwrap_or(""), a["slot"].as_str().unwrap_or(""));
        let kb = (b["kind"].as_str().unwrap_or(""), b["slot"].as_str().unwrap_or(""));
        ka.cmp(&kb)
    });
    Ok(json!({ "ok": true, "presets": items }))
}

// Reject kind/slot values that could escape the data dir or produce junk
// filenames. Tauri commands are callable from ANY page JS, so validate even
// though the UI already constrains these (path-traversal hardening).
fn check_kind(kind: &str) -> Result<(), String> {
    if kind == "general" || kind == "single" {
        Ok(())
    } else {
        Err(format!("Invalid kind: {kind}"))
    }
}
fn check_slot(slot: &str) -> Result<(), String> {
    let mut chars = slot.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) if c.is_ascii_alphabetic() => Ok(()),
        _ => Err(format!("Invalid slot: {slot}")),
    }
}

/// `GET /presets/get`
#[tauri::command]
pub fn presets_get(kind: String, slot: String) -> Result<Value, String> {
    if kind != "general" && kind != "single" {
        return Err(format!("Invalid kind: {kind}"));
    }
    if slot.len() != 1 || !slot.chars().next().unwrap().is_ascii_alphabetic() {
        return Err(format!("Invalid slot: {slot}"));
    }
    let path = presets_dir().join(format!("{}_{}.json", kind, slot.to_uppercase()));
    if !path.exists() {
        return Err(format!("Preset {}/{} not found.", kind, slot.to_uppercase()));
    }
    let mut raw: Value = fs::read_to_string(&path)
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))?;
    let missing_kind = raw.get("kind").and_then(|v| v.as_str()).is_none();
    let missing_slot = raw.get("slot").and_then(|v| v.as_str()).is_none();
    if missing_kind || missing_slot {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if let (Some((fk, fs_)), Some(obj)) = (derive_from_filename(stem), raw.as_object_mut()) {
            if missing_kind {
                obj.insert("kind".into(), json!(fk));
            }
            if missing_slot {
                obj.insert("slot".into(), json!(fs_));
            }
        }
    }
    Ok(json!({ "ok": true, "preset": raw, "path": path.to_string_lossy() }))
}

/// `POST /presets/save`
#[tauri::command]
pub fn presets_save(kind: String, slot: String, assignments: Vec<Value>) -> Result<Value, String> {
    check_kind(&kind)?;
    check_slot(&slot)?;
    // Normalize each assignment's `type` (url if a url with no program, else program).
    let norm: Vec<Value> = assignments
        .into_iter()
        .map(|mut a| {
            if let Some(obj) = a.as_object_mut() {
                let has_type = obj
                    .get("type")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                if !has_type {
                    let has_url = obj.get("url").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
                    let has_prog = obj.get("program").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
                    let t = if has_url && !has_prog { "url" } else { "program" };
                    obj.insert("type".into(), json!(t));
                }
            }
            a
        })
        .collect();
    let dir = presets_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}_{}.json", kind, slot.to_uppercase()));
    let payload = json!({ "kind": kind, "slot": slot, "assignments": norm });
    fs::write(&path, serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
}

/// `DELETE /presets/delete`
#[tauri::command]
pub fn presets_delete(kind: String, slot: String) -> Result<Value, String> {
    check_kind(&kind)?;
    check_slot(&slot)?;
    let path = presets_dir().join(format!("{}_{}.json", kind, slot.to_uppercase()));
    if !path.exists() {
        return Err("Preset not found.".into());
    }
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "deleted": path.to_string_lossy() }))
}

// ----------------------------------------------------------------------------
// Quick Presets — named bundles of Layouts. File-only; mirrors /quickpresets/*.
// ----------------------------------------------------------------------------

/// `GET /quickpresets/list`
#[tauri::command]
pub fn quickpresets_list() -> Result<Value, String> {
    let mut items: Vec<Value> = Vec::new();
    if let Ok(rd) = fs::read_dir(quickpresets_dir()) {
        for entry in rd.flatten() {
            let path = entry.path();
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            if !stem.starts_with("QP_") || path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let raw: Value = match fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
            {
                Some(v) => v,
                None => continue,
            };
            let slot = raw
                .get("slot")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| stem.trim_start_matches("QP_").to_string())
                .to_uppercase();
            if slot.len() != 1 || !slot.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false) {
                continue;
            }
            let name = raw
                .get("name")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from)
                .unwrap_or_else(|| format!("Quick Preset {slot}"));
            let layout_count = raw.get("layouts").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
            items.push(json!({
                "slot": slot,
                "name": name,
                "layoutCount": layout_count,
                "path": path.to_string_lossy(),
                "updatedAt": mtime_iso(&path),
            }));
        }
    }
    items.sort_by(|a, b| a["slot"].as_str().unwrap_or("").cmp(b["slot"].as_str().unwrap_or("")));
    Ok(json!({ "ok": true, "quickpresets": items }))
}

/// `GET /quickpresets/get`
#[tauri::command]
pub fn quickpresets_get(slot: String) -> Result<Value, String> {
    if slot.len() != 1 || !slot.chars().next().unwrap().is_ascii_alphabetic() {
        return Err(format!("Invalid slot: {slot}"));
    }
    let path = quickpresets_dir().join(format!("QP_{}.json", slot.to_uppercase()));
    if !path.exists() {
        return Err(format!("Quick Preset {} not found.", slot.to_uppercase()));
    }
    let mut raw: Value = fs::read_to_string(&path)
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))?;
    if let Some(obj) = raw.as_object_mut() {
        let s = obj.get("slot").and_then(|v| v.as_str()).unwrap_or(&slot).to_uppercase();
        obj.insert("slot".into(), json!(s));
    }
    Ok(json!({ "ok": true, "quickpreset": raw, "path": path.to_string_lossy() }))
}

/// `POST /quickpresets/save`
#[tauri::command]
pub fn quickpresets_save(slot: String, name: String, layouts: Vec<Value>) -> Result<Value, String> {
    check_slot(&slot)?;
    if layouts.is_empty() {
        return Err("A Quick Preset must reference at least one Layout.".into());
    }
    let pdir = presets_dir();
    let mut missing: Vec<String> = Vec::new();
    let norm_layouts: Vec<Value> = layouts
        .iter()
        .map(|l| {
            let k = l.get("kind").and_then(|v| v.as_str()).unwrap_or("general").to_string();
            let s = l.get("slot").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
            if !pdir.join(format!("{}_{}.json", k, s)).exists() {
                missing.push(format!("{}/{}", k, s));
            }
            json!({ "kind": k, "slot": s })
        })
        .collect();
    let name = {
        let t = name.trim();
        if t.is_empty() {
            format!("Quick Preset {}", slot.to_uppercase())
        } else {
            t.to_string()
        }
    };
    let payload = json!({
        "kind": "quickpreset",
        "slot": slot.to_uppercase(),
        "name": name,
        "layouts": norm_layouts,
    });
    let dir = quickpresets_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("QP_{}.json", slot.to_uppercase()));
    fs::write(&path, serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "path": path.to_string_lossy(), "missingLayouts": missing }))
}

/// `DELETE /quickpresets/delete`
#[tauri::command]
pub fn quickpresets_delete(slot: String) -> Result<Value, String> {
    check_slot(&slot)?;
    let path = quickpresets_dir().join(format!("QP_{}.json", slot.to_uppercase()));
    if !path.exists() {
        return Err("Quick Preset not found.".into());
    }
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "deleted": path.to_string_lossy() }))
}

// ----------------------------------------------------------------------------
// Browse — filesystem listing for the in-app file picker. Pure OS, no agent.
// ----------------------------------------------------------------------------

/// `GET /browse` — empty path lists drive roots; otherwise lists a directory
/// (folders first), hiding `$`-prefixed + "System Volume Information" noise.
#[tauri::command]
pub fn browse(path: Option<String>) -> Result<Value, String> {
    let path = path.unwrap_or_default();
    if path.is_empty() {
        let mut drives: Vec<Value> = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                drives.push(json!({ "name": drive, "isDir": true, "isExe": false }));
            }
        }
        return Ok(json!({ "ok": true, "path": "", "parent": Value::Null, "entries": drives }));
    }

    let p = PathBuf::from(expand_env_vars(&path));
    if !p.exists() {
        return Err(format!("Path not found: {}", p.display()));
    }
    if !p.is_dir() {
        return Err(format!("Not a directory: {}", p.display()));
    }

    let mut entries: Vec<Value> = Vec::new();
    let rd = fs::read_dir(&p).map_err(|e| format!("OS error: {e}"))?;
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('$') || name == "System Volume Information" {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let lower = name.to_lowercase();
        let is_exe = !is_dir
            && (lower.ends_with(".exe")
                || lower.ends_with(".lnk")
                || lower.ends_with(".bat")
                || lower.ends_with(".cmd"));
        entries.push(json!({ "name": name, "isDir": is_dir, "isExe": is_exe }));
    }
    // Folders first, then case-insensitive by name.
    entries.sort_by(|a, b| {
        let ad = a["isDir"].as_bool().unwrap_or(false);
        let bd = b["isDir"].as_bool().unwrap_or(false);
        bd.cmp(&ad).then_with(|| {
            a["name"].as_str().unwrap_or("").to_lowercase().cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
        })
    });

    let parent_val = match p.parent() {
        Some(pp) if pp != p.as_path() => json!(pp.to_string_lossy()),
        _ => Value::Null,
    };
    Ok(json!({ "ok": true, "path": p.to_string_lossy(), "parent": parent_val, "entries": entries }))
}

// ----------------------------------------------------------------------------
// Agent-invoking commands — shell out to the C# WinAgent (the real Win32 work),
// replicating the Python server's `dotnet <AGENT_PATH> <args>` subprocess calls.
// ----------------------------------------------------------------------------

/// `GET /monitors` — runs the agent's `--list-monitors` and returns the JSON it
/// prints (last non-empty stdout line), unchanged — same as the Python server.
#[tauri::command]
pub async fn monitors() -> Result<Value, String> {
    let agent = agent_path();
    if !agent.exists() {
        return Err(format!("Agent DLL not found at {}", agent.display()));
    }
    let fut = tokio::process::Command::new("dotnet")
        .arg(&agent)
        .arg("--list-monitors")
        .output();
    let out = match tokio::time::timeout(std::time::Duration::from_secs(10), fut).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(format!("Failed to run agent: {e}")),
        Err(_) => return Err("Agent timed out enumerating monitors".into()),
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    let line = stdout.lines().map(str::trim).filter(|l| !l.is_empty()).last().unwrap_or("");
    if line.is_empty() {
        return Err(format!(
            "Empty agent response. stderr: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    serde_json::from_str(line).map_err(|e| format!("Agent returned non-JSON: {e}"))
}

// ----------------------------------------------------------------------------
// Launch / apply — spawn the agent to place windows. Mirrors the Python
// _dotnet_cmd / _run_launch / _apply_preset, including TEMP-FILE stdio (the
// agent's spawned apps inherit its handles → pipes would block forever) and
// the parallel-across-program / serial-within-program apply ordering.
// ----------------------------------------------------------------------------

#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchBody {
    // (assignment `type` is read from the raw JSON in apply_preset, not here)
    pub program: Option<String>,
    pub url: Option<String>,
    pub title: Option<String>,
    pub args: Option<String>,
    pub single_instance: Option<bool>,
    pub urls: Option<Vec<String>>,
    #[serde(default = "default_monitor")]
    pub monitor: i64,
    #[serde(default = "default_grid")]
    pub grid: String,
    #[serde(default = "default_grid_size")]
    pub grid_size: String,
    pub no_move: Option<bool>,
    pub no_dpi: Option<bool>,
    pub frame_mode: Option<String>,
    pub activate: Option<bool>,
    pub topmost: Option<bool>,
    pub wait_ready_ms: Option<i64>,
    pub margin_px: Option<i64>,
}
fn default_monitor() -> i64 {
    1
}
fn default_grid() -> String {
    "1,1,3,3".into()
}
fn default_grid_size() -> String {
    "6x6".into()
}

// Resolve the browser to open URL-only assignments in. Order: explicit env
// override → the OS default browser (registry UserChoice) → the first detected
// installed browser → Chrome at its usual path (last resort). The old behavior
// hardcoded Chrome, which silently failed on machines without it.
fn default_browser() -> String {
    if let Ok(p) = std::env::var("DEFAULT_BROWSER_PATH") {
        if !p.trim().is_empty() {
            return p;
        }
    }
    #[cfg(windows)]
    {
        if let Some(p) = browsers::default_browser_exe() {
            return p;
        }
        if let Some(b) = browsers::detect().into_iter().next() {
            return b.path;
        }
    }
    r"C:\Program Files\Google\Chrome\Application\chrome.exe".to_string()
}

/// Read a temp file (the agent's captured stdout/stderr) to a lossy string.
fn read_temp(mut f: std::fs::File) -> String {
    use std::io::{Read, Seek, SeekFrom};
    let _ = f.seek(SeekFrom::Start(0));
    let mut buf = Vec::new();
    let _ = f.read_to_end(&mut buf);
    String::from_utf8_lossy(&buf).into_owned()
}

/// Build the `dotnet` arg list (agent path first) for one launch — mirrors
/// the Python `_dotnet_cmd`.
fn dotnet_args(body: &LaunchBody) -> Vec<String> {
    let mut a: Vec<String> = vec![agent_path().to_string_lossy().into_owned()];
    let nonempty = |s: &Option<String>| s.as_deref().filter(|x| !x.is_empty()).map(str::to_string);
    if let Some(p) = nonempty(&body.program) {
        a.push("--program".into());
        a.push(expand_env_vars(&p));
    }
    if let Some(t) = nonempty(&body.title) {
        a.push("--title".into());
        a.push(t);
    }
    if let Some(u) = nonempty(&body.url) {
        a.push("--url".into());
        a.push(u);
    }
    if let Some(g) = nonempty(&body.args) {
        a.push("--args".into());
        a.push(g);
    }
    if body.single_instance == Some(true) {
        a.push("--single-instance".into());
        a.push("true".into());
    }
    if let Some(urls) = &body.urls {
        if !urls.is_empty() {
            a.push("--urls".into());
            a.push(urls.join(" "));
        }
    }
    a.push("--monitor".into());
    a.push(body.monitor.to_string());
    a.push("--grid".into());
    a.push(body.grid.clone());
    a.push("--grid-size".into());
    a.push(body.grid_size.clone());
    if body.no_move == Some(true) {
        a.push("--no-move".into());
    }
    if body.no_dpi == Some(true) {
        a.push("--no-dpi".into());
    }
    if let Some(fm) = nonempty(&body.frame_mode) {
        a.push("--frameMode".into());
        a.push(fm);
    }
    if body.activate == Some(false) {
        a.push("--activate".into());
        a.push("false".into());
    }
    if body.topmost == Some(true) {
        a.push("--topmost".into());
        a.push("true".into());
    }
    if let Some(w) = body.wait_ready_ms {
        a.push("--waitReady".into());
        a.push(w.to_string());
    }
    if let Some(m) = body.margin_px {
        if m > 0 {
            a.push("--cell-margin-px".into());
            a.push(m.to_string());
        }
    }
    a
}

/// Run one launch through the agent. Returns a LaunchResponse-shaped Value.
/// Uses temp files for the agent's stdio (inherited by its spawned apps), and
/// waits on the AGENT process (not pipe EOF) with a 45s timeout.
async fn run_launch(body: &LaunchBody) -> Value {
    let mut body = body.clone();
    let has_prog = body.program.as_deref().map(|s| !s.is_empty()).unwrap_or(false);
    let has_url = body.url.as_deref().map(|s| !s.is_empty()).unwrap_or(false);
    if !has_prog && has_url {
        body.program = Some(default_browser());
    }
    if let Some(p) = body.program.as_deref() {
        if p.to_lowercase().ends_with(".lnk") {
            return json!({
                "exitCode": 1, "stdout": "",
                "stderr": format!("[InstaDesk] Shortcut files (.lnk) are not supported: {p}\nEdit the Layout in the Apps tab — remove the Custom entry that points to this .lnk and re-assign using the catalog app (which uses the .exe directly), then re-save the Layout."),
                "cmd": "",
            });
        }
    }
    let agent = agent_path();
    if !agent.exists() {
        return json!({ "exitCode": 1, "stdout": "", "stderr": format!("Agent DLL not found at {}", agent.display()), "cmd": "" });
    }
    let args = dotnet_args(&body);
    let cmd_str = format!("dotnet {}", args.join(" "));

    macro_rules! tmp_or_err {
        ($e:expr) => {
            match $e {
                Ok(v) => v,
                Err(e) => return json!({ "exitCode": 1, "stdout": "", "stderr": e.to_string(), "cmd": cmd_str }),
            }
        };
    }
    let so = tmp_or_err!(tempfile::tempfile());
    let se = tmp_or_err!(tempfile::tempfile());
    let so_read = tmp_or_err!(so.try_clone());
    let se_read = tmp_or_err!(se.try_clone());

    let spawned = tokio::process::Command::new("dotnet")
        .args(&args)
        .stdout(std::process::Stdio::from(so))
        .stderr(std::process::Stdio::from(se))
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) => return json!({ "exitCode": 1, "stdout": "", "stderr": format!("Failed to run agent: {e}"), "cmd": cmd_str }),
    };

    let (rc, timeout_msg) = match tokio::time::timeout(std::time::Duration::from_secs(45), child.wait()).await {
        Ok(Ok(status)) => (status.code().unwrap_or(1), ""),
        Ok(Err(_)) => (1, ""),
        Err(_) => {
            let _ = child.kill().await;
            (124, "\nTIMEOUT")
        }
    };

    let out = read_temp(so_read);
    let mut err = read_temp(se_read);
    err.push_str(timeout_msg);
    json!({ "exitCode": rc, "stdout": out, "stderr": err, "cmd": cmd_str })
}

/// Read a preset and apply every assignment — parallel across programs, serial
/// within each program (race-free for same-exe launches). Returns {ok, results}
/// in the saved assignments[] order.
async fn apply_preset(kind: &str, slot: &str, margin_px: Option<i64>) -> Result<Value, String> {
    let path = presets_dir().join(format!("{}_{}.json", kind, slot.to_uppercase()));
    if !path.exists() {
        return Err("Preset not found.".into());
    }
    let raw: Value = fs::read_to_string(&path)
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))?;
    let assignments = raw.get("assignments").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let mut bodies: Vec<LaunchBody> = Vec::new();
    for a in &assignments {
        let has_url = a.get("url").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        let has_prog = a.get("program").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
        let atype = a
            .get("type")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| if has_url && !has_prog { "url".into() } else { "program".into() });
        let mut body: LaunchBody = serde_json::from_value(a.clone()).unwrap_or_default();
        if atype == "program" {
            body.url = None;
        } else {
            body.program = None;
        }
        // Preset defaults: gapless (frameless), activate, brief wait-ready.
        if body.frame_mode.is_none() {
            body.frame_mode = Some("frameless".into());
        }
        if body.activate.is_none() {
            body.activate = Some(true);
        }
        if body.topmost.is_none() {
            body.topmost = Some(false);
        }
        if body.wait_ready_ms.is_none() {
            body.wait_ready_ms = Some(120);
        }
        body.margin_px = margin_px;
        bodies.push(body);
    }
    if bodies.is_empty() {
        return Ok(json!({ "ok": true, "results": [] }));
    }

    // Group by program (url-only bodies together); run groups concurrently,
    // each group's launches serially.
    let mut groups: std::collections::BTreeMap<String, Vec<(usize, LaunchBody)>> =
        std::collections::BTreeMap::new();
    for (i, b) in bodies.into_iter().enumerate() {
        let key = b.program.as_deref().map(|s| s.to_lowercase()).unwrap_or_else(|| "url-only".into());
        groups.entry(key).or_default().push((i, b));
    }
    let group_futs: Vec<_> = groups
        .into_values()
        .map(|items| async move {
            let mut out: Vec<(usize, Value)> = Vec::new();
            for (idx, body) in items {
                out.push((idx, run_launch(&body).await));
            }
            out
        })
        .collect();
    let group_outputs = futures::future::join_all(group_futs).await;
    let mut flat: Vec<(usize, Value)> = group_outputs.into_iter().flatten().collect();
    flat.sort_by_key(|(i, _)| *i);
    let results: Vec<Value> = flat.into_iter().map(|(_, r)| r).collect();
    Ok(json!({ "ok": true, "results": results }))
}

/// `POST /launch`
#[tauri::command]
pub async fn launch(body: LaunchBody) -> Result<Value, String> {
    Ok(run_launch(&body).await)
}

/// `POST /presets/run`
#[tauri::command]
pub async fn presets_run(kind: String, slot: String, margin_px: Option<i64>) -> Result<Value, String> {
    apply_preset(&kind, &slot, margin_px).await
}

/// `POST /quickpresets/run` — applies each referenced Layout sequentially.
#[tauri::command]
pub async fn quickpresets_run(slot: String, margin_px: Option<i64>) -> Result<Value, String> {
    let path = quickpresets_dir().join(format!("QP_{}.json", slot.to_uppercase()));
    if !path.exists() {
        return Err("Quick Preset not found.".into());
    }
    let raw: Value = fs::read_to_string(&path)
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))?;
    let layouts = raw.get("layouts").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let qp_name = raw
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| format!("Quick Preset {}", slot.to_uppercase()));

    let mut per_layout: Vec<Value> = Vec::new();
    for r in &layouts {
        let kind = r.get("kind").and_then(|v| v.as_str()).unwrap_or("general").to_string();
        let lslot = r.get("slot").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
        if lslot.len() != 1 || !lslot.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false) {
            per_layout.push(json!({ "kind": kind, "slot": lslot, "ok": false, "error": "Invalid layout slot in Quick Preset." }));
            continue;
        }
        if !presets_dir().join(format!("{}_{}.json", kind, lslot)).exists() {
            per_layout.push(json!({ "kind": kind, "slot": lslot, "ok": false, "error": format!("Layout {}/{} no longer exists.", kind, lslot) }));
            continue;
        }
        match apply_preset(&kind, &lslot, margin_px).await {
            Ok(res) => per_layout.push(json!({
                "kind": kind, "slot": lslot, "ok": true,
                "results": res.get("results").cloned().unwrap_or_else(|| json!([])),
            })),
            Err(e) => per_layout.push(json!({ "kind": kind, "slot": lslot, "ok": false, "error": e })),
        }
    }
    let succeeded = per_layout.iter().filter(|x| x.get("ok") == Some(&json!(true))).count();
    Ok(json!({
        "ok": true,
        "quickpreset": { "slot": slot.to_uppercase(), "name": qp_name },
        "summary": format!("{}/{} Layouts applied", succeeded, per_layout.len()),
        "layouts": per_layout,
    }))
}

// ----------------------------------------------------------------------------
// Snap popup (the Snap button) + foreground-window tracker.
// ----------------------------------------------------------------------------

/// Tight filter: matches ONLY the InstaDesk dashboard window or the agent's own
/// overlay form — those must never be tracked as a snap target.
fn looks_like_instadesk_title(title: &str) -> bool {
    let t = title.to_lowercase();
    t.contains("127.0.0.1:17866")
        || t.contains("localhost:17866")
        || t.starts_with("vite + react + ts")
        || t.starts_with("instadesk dashboard")
        || t == "instadesk snap"
}

/// Last-focused non-InstaDesk window handle (set by the foreground tracker,
/// read by snap). 0 = none known → agent falls back to a z-order scan.
fn tracker() -> &'static std::sync::Mutex<isize> {
    static T: std::sync::OnceLock<std::sync::Mutex<isize>> = std::sync::OnceLock::new();
    T.get_or_init(|| std::sync::Mutex::new(0isize))
}
fn tracker_target() -> isize {
    tracker().lock().map(|g| *g).unwrap_or(0)
}
fn set_tracker_target(hwnd: isize) {
    if let Ok(mut g) = tracker().lock() {
        *g = hwnd;
    }
}
fn reset_tracker() {
    set_tracker_target(0);
}

/// Spawn the agent with temp-file stdio, wait on the process with a timeout,
/// return (exit code, stdout, stderr, timeout-suffix).
async fn run_agent(args: &[String], timeout_secs: u64) -> Result<(i32, String, String, &'static str), String> {
    let so = tempfile::tempfile().map_err(|e| e.to_string())?;
    let se = tempfile::tempfile().map_err(|e| e.to_string())?;
    let so_read = so.try_clone().map_err(|e| e.to_string())?;
    let se_read = se.try_clone().map_err(|e| e.to_string())?;
    let mut child = tokio::process::Command::new("dotnet")
        .args(args)
        .stdout(std::process::Stdio::from(so))
        .stderr(std::process::Stdio::from(se))
        .spawn()
        .map_err(|e| format!("Failed to run agent: {e}"))?;
    let (rc, tmsg) = match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), child.wait()).await {
        Ok(Ok(status)) => (status.code().unwrap_or(1), ""),
        Ok(Err(_)) => (1, ""),
        Err(_) => {
            let _ = child.kill().await;
            (124, "\nTIMEOUT")
        }
    };
    Ok((rc, read_temp(so_read), read_temp(se_read), tmsg))
}

/// `POST /snap/popup` — Divvy-style ad-hoc snap. Opens the agent's overlay on
/// the target monitor; blocks (180s) until the user commits or cancels. Passes
/// the foreground tracker's last target via `--target-hwnd` when known; else the
/// agent falls back to a z-order scan. Returns {exitCode, result, stdout, stderr,
/// cmd}, where `result` is the JSON the agent prints (its last `{...}` line).
#[tauri::command]
pub async fn snap_popup(monitor: i64, grid_size: Option<String>, margin_px: Option<i64>) -> Result<Value, String> {
    let agent = agent_path();
    if !agent.exists() {
        return Err(format!("Agent DLL not found at {}", agent.display()));
    }
    let grid_size = grid_size.unwrap_or_else(|| "6x6".into());
    let mut args: Vec<String> = vec![
        agent.to_string_lossy().into_owned(),
        "--snap-popup".into(),
        "--monitor".into(),
        monitor.to_string(),
        "--grid-size".into(),
        grid_size,
    ];
    if let Some(m) = margin_px {
        if m > 0 {
            args.push("--cell-margin-px".into());
            args.push(m.to_string());
        }
    }
    let tracked = tracker_target();
    if tracked != 0 {
        args.push("--target-hwnd".into());
        args.push(tracked.to_string());
    }
    let cmd_str = format!("dotnet {}", args.join(" "));

    let (rc, out, err, tmsg) = run_agent(&args, 180).await?;

    // The agent's last stdout `{...}` line is the JSON result.
    let mut result = json!({});
    for line in out.lines().rev() {
        let l = line.trim();
        if l.starts_with('{') && l.ends_with('}') {
            if let Ok(v) = serde_json::from_str::<Value>(l) {
                result = v;
                break;
            }
        }
    }
    // Release the tracker after a successful snap — each snap is independent;
    // the user must focus a window again for the next one.
    if result.get("ok") == Some(&json!(true)) {
        reset_tracker();
    }

    Ok(json!({
        "exitCode": rc,
        "result": result,
        "stdout": format!("{}{}", out, tmsg),
        "stderr": err,
        "cmd": cmd_str,
    }))
}

/// Start the foreground-window tracker (records the last-focused non-InstaDesk
/// window so snap can target it via --target-hwnd). Win32 SetWinEventHook +
/// message pump on a dedicated thread, mirroring the Python server. No-op on
/// non-Windows. Called once at app startup.
pub fn start_foreground_tracker() {
    #[cfg(windows)]
    foreground::start();
}

#[cfg(windows)]
mod foreground {
    use super::{looks_like_instadesk_title, set_tracker_target};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetMessageW, GetWindowTextLengthW, GetWindowTextW, EVENT_SYSTEM_FOREGROUND, MSG,
        OBJID_WINDOW, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
    };

    fn window_title(hwnd: HWND) -> String {
        unsafe {
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 {
                return String::new();
            }
            let mut buf = vec![0u16; (len + 1) as usize];
            let n = GetWindowTextW(hwnd, &mut buf);
            if n <= 0 {
                return String::new();
            }
            String::from_utf16_lossy(&buf[..n as usize])
        }
    }

    // SetWinEventHook callback — fires on every foreground change. Promotes a
    // window to the snap target only if it's a real window with a title that
    // isn't InstaDesk's own dashboard/overlay.
    unsafe extern "system" fn hook_proc(
        _hook: HWINEVENTHOOK,
        event: u32,
        hwnd: HWND,
        id_object: i32,
        _id_child: i32,
        _thread: u32,
        _time: u32,
    ) {
        if event != EVENT_SYSTEM_FOREGROUND || hwnd.0.is_null() || id_object != OBJID_WINDOW.0 {
            return;
        }
        let title = window_title(hwnd);
        if title.is_empty() || looks_like_instadesk_title(&title) {
            return;
        }
        set_tracker_target(hwnd.0 as isize);
    }

    pub fn start() {
        let _ = std::thread::Builder::new()
            .name("foreground-hook".into())
            .spawn(|| unsafe {
                let hook = SetWinEventHook(
                    EVENT_SYSTEM_FOREGROUND,
                    EVENT_SYSTEM_FOREGROUND,
                    None,
                    Some(hook_proc),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
                );
                if hook.is_invalid() {
                    return;
                }
                // Out-of-context hooks deliver callbacks on this thread; we just
                // need to pump messages so deliveries can happen.
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).0 > 0 {}
                let _ = UnhookWinEvent(hook);
            });
    }
}

/// One installed browser: a friendly name + the real executable path. Serialized
/// camelCase to match the TS `BrowserInfo` the URL-Builder picker consumes.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    pub name: String,
    pub path: String,
}

/// List the browsers actually installed on this machine. Reads the Windows
/// registry `SOFTWARE\Clients\StartMenuInternet` (HKLM + HKCU) — the canonical
/// registered-browser list — resolving each to its real exe. Feeds the URL
/// Builder "Add Browser" picker so users pick a browser that exists (and that
/// URL groups can truly launch) instead of typing a label. Empty on non-Windows.
#[tauri::command]
pub fn list_browsers() -> Vec<BrowserInfo> {
    #[cfg(windows)]
    {
        browsers::detect()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

/// Open a native "pick a program file" dialog and return the chosen path (None
/// if cancelled). `title` and `extensions` (default ["exe"]) are caller-supplied
/// so both the browser picker (Browse-for-.exe) and the Apps Browse modal can
/// share it. Native (rfd) — no JS dialog plugin or capability wiring needed.
#[tauri::command]
pub fn pick_exe(title: Option<String>, extensions: Option<Vec<String>>) -> Option<String> {
    let exts = extensions.unwrap_or_else(|| vec!["exe".to_string()]);
    rfd::FileDialog::new()
        .set_title(title.unwrap_or_else(|| "Select a program".to_string()))
        .add_filter("Programs", &exts)
        .pick_file()
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(windows)]
mod browsers {
    use super::BrowserInfo;
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    // The OS default browser's exe, via the user's UrlAssociations UserChoice
    // (https → http) ProgId → HKCR\<ProgId>\shell\open\command. None if it can't
    // be resolved (falls back to detection / Chrome upstream).
    pub fn default_browser_exe() -> Option<String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
        for scheme in ["https", "http"] {
            let assoc = format!(
                r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\{}\UserChoice",
                scheme
            );
            let progid = hkcu
                .open_subkey(&assoc)
                .ok()
                .and_then(|k| k.get_value::<String, _>("ProgId").ok());
            if let Some(progid) = progid {
                let cmd = hkcr
                    .open_subkey(format!(r"{}\shell\open\command", progid))
                    .ok()
                    .and_then(|k| k.get_value::<String, _>("").ok());
                if let Some(exe) = cmd.as_deref().and_then(exe_from_command) {
                    // %1-only ProgIds (e.g. some handlers) resolve to a real exe;
                    // ignore anything that isn't a .exe path.
                    if exe.to_lowercase().ends_with(".exe") {
                        return Some(exe);
                    }
                }
            }
        }
        None
    }

    // Extract the exe from a `shell\open\command` string — typically a quoted
    // path, optionally followed by args: `"C:\...\chrome.exe" -- "%1"`.
    pub(crate) fn exe_from_command(cmd: &str) -> Option<String> {
        let cmd = cmd.trim();
        if cmd.is_empty() {
            return None;
        }
        let path = if let Some(rest) = cmd.strip_prefix('"') {
            rest.split('"').next().unwrap_or("").to_string() // up to closing quote
        } else if let Some(i) = cmd.to_lowercase().find(".exe") {
            cmd[..i + 4].to_string() // unquoted: up to and including ".exe"
        } else {
            cmd.split_whitespace().next().unwrap_or("").to_string()
        };
        let path = path.trim().to_string();
        if path.is_empty() {
            None
        } else {
            Some(path)
        }
    }

    fn read_hive(hive: RegKey, out: &mut Vec<BrowserInfo>) {
        let smi = match hive.open_subkey(r"SOFTWARE\Clients\StartMenuInternet") {
            Ok(k) => k,
            Err(_) => return,
        };
        for sub in smi.enum_keys().flatten() {
            let key = match smi.open_subkey(&sub) {
                Ok(k) => k,
                Err(_) => continue,
            };
            let cmd: String = match key
                .open_subkey(r"shell\open\command")
                .and_then(|c| c.get_value(""))
            {
                Ok(v) => v,
                Err(_) => continue,
            };
            let path = match exe_from_command(&cmd) {
                Some(p) => p,
                None => continue,
            };
            // Friendly name: subkey default value → Capabilities\ApplicationName
            // → the registry key id as a last resort.
            let name: String = key
                .get_value::<String, _>("")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .or_else(|| {
                    key.open_subkey("Capabilities")
                        .ok()
                        .and_then(|c| c.get_value::<String, _>("ApplicationName").ok())
                })
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| sub.clone());
            out.push(BrowserInfo { name, path });
        }
    }

    pub fn detect() -> Vec<BrowserInfo> {
        let mut out: Vec<BrowserInfo> = Vec::new();
        read_hive(RegKey::predef(HKEY_LOCAL_MACHINE), &mut out);
        read_hive(RegKey::predef(HKEY_CURRENT_USER), &mut out);
        // HKLM + HKCU often list the same browser — dedupe by exe path.
        let mut seen = std::collections::HashSet::new();
        out.retain(|b| seen.insert(b.path.to_lowercase()));
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn exe_from_command_parses_quoted_and_bare() {
        use super::browsers::exe_from_command;
        assert_eq!(
            exe_from_command(r#""C:\Program Files\Google\Chrome\Application\chrome.exe" -- "%1""#),
            Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe".to_string())
        );
        assert_eq!(
            exe_from_command(r"C:\Windows\System32\notepad.exe /arg"),
            Some(r"C:\Windows\System32\notepad.exe".to_string())
        );
        assert_eq!(exe_from_command("   "), None);
    }

    #[test]
    fn health_reports_ok_and_resolves_paths() {
        let h = health();
        assert!(h.ok);
        assert!(h.mode == "dll");
        assert_eq!(h.timeout_sec, 45);
        assert!(!h.agent_path.is_empty(), "agent path should resolve");
        assert!(!h.data_dir.is_empty(), "data dir should resolve");
        // In this dev tree the WinAgent DLL exists under the outer repo, so the
        // walk-up resolution should locate it (mirrors the Python server).
        assert!(
            h.agent_exists,
            "agent dll should be found — resolved to: {}",
            h.agent_path
        );
        // serde must emit camelCase keys matching the TS HealthResponse.
        let json = serde_json::to_string(&h).unwrap();
        assert!(json.contains("\"agentPath\""));
        assert!(json.contains("\"agentExists\""));
        assert!(json.contains("\"timeoutSec\""));
        assert!(json.contains("\"dataDir\""));
    }

    #[test]
    fn derive_from_filename_works() {
        assert_eq!(derive_from_filename("general_A"), Some(("general".into(), "A".into())));
        assert_eq!(derive_from_filename("single_b"), Some(("single".into(), "B".into())));
        assert_eq!(derive_from_filename("QP_A"), None);
        assert_eq!(derive_from_filename("general_AB"), None);
        assert_eq!(derive_from_filename("nope"), None);
    }

    #[test]
    fn expand_env_vars_works() {
        std::env::set_var("INSTADESK_TEST_VAR", "HELLO");
        assert_eq!(expand_env_vars("x_%INSTADESK_TEST_VAR%_y"), "x_HELLO_y");
        assert_eq!(expand_env_vars("no vars here"), "no vars here");
        assert_eq!(expand_env_vars("%UNSET_XYZ%"), "%UNSET_XYZ%");
        std::env::remove_var("INSTADESK_TEST_VAR");
    }

    #[test]
    fn presets_roundtrip_save_get_list_delete() {
        // Isolate to a temp data dir so real presets are untouched.
        let tmp = std::env::temp_dir().join(format!("instadesk_test_{}", std::process::id()));
        std::env::set_var("INSTADESK_DATA_DIR", &tmp);

        let save = presets_save(
            "general".into(),
            "z".into(),
            vec![json!({ "program": "notepad.exe", "monitor": 1, "grid": "1,1,2,2", "gridSize": "6x6" })],
        )
        .unwrap();
        assert_eq!(save["ok"], json!(true));

        let got = presets_get("general".into(), "z".into()).unwrap();
        assert_eq!(got["preset"]["kind"], json!("general"));
        // `type` was normalized to "program" on save.
        assert_eq!(got["preset"]["assignments"][0]["type"], json!("program"));

        let list = presets_list().unwrap();
        let found = list["presets"].as_array().unwrap().iter().any(|p| p["slot"] == json!("Z"));
        assert!(found, "saved preset should appear in the list");

        let del = presets_delete("general".into(), "z".into()).unwrap();
        assert_eq!(del["ok"], json!(true));
        assert!(presets_get("general".into(), "z".into()).is_err(), "deleted preset should be gone");

        let _ = fs::remove_dir_all(&tmp);
        std::env::remove_var("INSTADESK_DATA_DIR");
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

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

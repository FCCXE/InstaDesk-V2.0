//! App-side licensing / trial layer (approved design — see memory:
//! project_instadesk_licensing_trial_layer). Lemon Squeezy MoR, hybrid
//! Lifetime + Annual, 10-day full-feature trial, online activation (3-device),
//! 10-day offline grace, locked-state = app opens but core actions gated.
//!
//! DORMANT BY DEFAULT: everything here is inert unless licensing is explicitly
//! enabled (env `INSTADESK_LICENSING` for dev/CLI tests, or a `.licensing-enabled`
//! marker file in the app-data dir for runtime preview). The production default
//! stays OFF until go-live (paired with the Lemon Squeezy account + code-signing
//! cert, both gated on the UK Ltd). So this build changes nothing for the user yet.
//!
//! INCREMENT 1 (this commit): durable trial tracking (survives a reinstall via a
//! registry copy) + the trial/expired state machine + a `license_status` command
//! the UI reads. Online activation (Lemon Squeezy) + the License screen + the
//! locked-state gating come in later increments.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// Full-feature trial length (operator-approved).
const TRIAL_DAYS: i64 = 10;
/// Raises the bar against a casual hand-edit of the stored timestamp (not a real
/// secret — client-side trial tracking is best-effort by design).
const SALT: &str = "InstaDesk-trial-v1";

/// Licensing is inert unless explicitly enabled. Keeps the whole layer dormant
/// for users until we flip the default at go-live.
pub fn licensing_enabled(app: &AppHandle) -> bool {
    if std::env::var_os("INSTADESK_LICENSING").is_some() {
        return true;
    }
    app.path()
        .app_data_dir()
        .map(|d| d.join(".licensing-enabled").exists())
        .unwrap_or(false)
}

// FNV-1a over "<ts>:<salt>" — stable + dependency-free. Stored alongside the
// timestamp so an edited value is rejected (the source is then treated as absent).
fn sig(ts: i64) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in format!("{ts}:{SALT}").bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}
fn encode(ts: i64) -> String {
    format!("{ts}.{}", sig(ts))
}
fn decode(s: &str) -> Option<i64> {
    let (ts_s, sig_s) = s.trim().split_once('.')?;
    let ts: i64 = ts_s.parse().ok()?;
    let stored: u64 = sig_s.parse().ok()?;
    (stored == sig(ts)).then_some(ts)
}

fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn trial_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(".trial"))
}
fn read_file_ts(app: &AppHandle) -> Option<i64> {
    decode(&std::fs::read_to_string(trial_file(app)?).ok()?)
}
fn write_file_ts(app: &AppHandle, ts: i64) {
    if let Some(p) = trial_file(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(p, encode(ts));
    }
}

// Registry copy in HKCU survives an app reinstall (which wipes app-data), so a
// reinstall doesn't reset the trial. Same-user, no elevation needed.
#[cfg(windows)]
const REG_PATH: &str = r"Software\FcXeStudios\InstaDesk";
#[cfg(windows)]
fn read_reg_ts() -> Option<i64> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(REG_PATH).ok()?;
    let v: String = key.get_value("t").ok()?;
    decode(&v)
}
#[cfg(windows)]
fn write_reg_ts(ts: i64) {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    if let Ok((key, _)) = hkcu.create_subkey(REG_PATH) {
        let _ = key.set_value("t", &encode(ts));
    }
}
#[cfg(not(windows))]
fn read_reg_ts() -> Option<i64> {
    None
}
#[cfg(not(windows))]
fn write_reg_ts(_ts: i64) {}

/// Trial start (unix secs). Reads app-data + registry, takes the EARLIEST valid
/// value (so clearing one source can't reset the trial), back-fills any missing
/// source, and creates it on first run.
fn trial_start(app: &AppHandle) -> i64 {
    let ts = [read_file_ts(app), read_reg_ts()]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or_else(now_secs);
    write_file_ts(app, ts);
    write_reg_ts(ts);
    ts
}

/// Current license/trial status for the UI. When licensing is disabled (default),
/// returns `enabled:false` and the UI treats the app as unrestricted. Increment 1
/// covers trial + expired only (activation arrives later → never "licensed" yet).
#[tauri::command]
pub fn license_status(app: AppHandle) -> Value {
    if !licensing_enabled(&app) {
        return json!({ "enabled": false, "state": "unrestricted" });
    }
    let start = trial_start(&app);
    let elapsed_days = (now_secs() - start).max(0) / 86_400;
    let days_left = (TRIAL_DAYS - elapsed_days).max(0);
    json!({
        "enabled": true,
        "state": if days_left > 0 { "trial" } else { "expired" },
        "trialDaysTotal": TRIAL_DAYS,
        "trialDaysLeft": days_left,
        "trialStartedUnix": start,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_roundtrips() {
        let ts = 1_750_000_000_i64;
        assert_eq!(decode(&encode(ts)), Some(ts));
    }

    #[test]
    fn tampered_timestamp_is_rejected() {
        // Editing the timestamp without recomputing the signature must fail, so a
        // user can't simply hand-edit the stored value to extend the trial.
        let good = encode(1_750_000_000);
        let (_, sig_part) = good.split_once('.').unwrap();
        let forged = format!("{}.{}", 1_700_000_000, sig_part); // older ts, old sig
        assert_eq!(decode(&forged), None);
        assert_eq!(decode("garbage"), None);
        assert_eq!(decode("123"), None);
    }
}

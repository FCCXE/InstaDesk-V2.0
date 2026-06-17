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

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// Full-feature trial length (operator-approved).
const TRIAL_DAYS: i64 = 10;
/// Raises the bar against a casual hand-edit of the stored timestamp (not a real
/// secret — client-side trial tracking is best-effort by design).
const SALT: &str = "InstaDesk-trial-v1";

/// Cached lock state read by the gated backend commands + the drag-snap hook
/// (which has no AppHandle). Kept current by `refresh_lock` at startup and by
/// every `license_status` / activate / deactivate call. `locked` = licensing
/// enabled AND the trial has ended with no active license.
static LICENSE_LOCKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// True when InstaDesk's value actions should be blocked (trial over, unlicensed).
/// Read by backend command gates + the drag-snap hook.
pub fn locked() -> bool {
    LICENSE_LOCKED.load(std::sync::atomic::Ordering::Relaxed)
}

/// Recompute + cache the lock state. Call at startup; status/activate/deactivate
/// also refresh it. Returns the locked value.
pub fn refresh_lock(app: &AppHandle) -> bool {
    let l = evaluate(app).0 == "expired";
    LICENSE_LOCKED.store(l, std::sync::atomic::Ordering::Relaxed);
    l
}

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

// Preview/test override: force the trial to read as EXPIRED (so the locked state
// can be exercised without waiting out the 10 days). Enabled via env
// `INSTADESK_LICENSING=expired` or by putting `expired` inside the
// `.licensing-enabled` marker file. Has no effect once a license is activated.
fn force_expired(app: &AppHandle) -> bool {
    if let Ok(v) = std::env::var("INSTADESK_LICENSING") {
        if v.eq_ignore_ascii_case("expired") {
            return true;
        }
    }
    app.path()
        .app_data_dir()
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join(".licensing-enabled")).ok())
        .map(|s| s.trim().eq_ignore_ascii_case("expired"))
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

// ---------------------------------------------------------------------------
// License record (a successful activation), stored in app-data `.license`.
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
struct LicenseRecord {
    key: String,
    kind: String, // "lifetime" | "annual"
    instance_id: String,
    activated_unix: i64,
    expires_unix: Option<i64>, // annual only; None = perpetual
    last_validated_unix: i64,
}

fn license_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(".license"))
}
fn read_license(app: &AppHandle) -> Option<LicenseRecord> {
    serde_json::from_str(&std::fs::read_to_string(license_file(app)?).ok()?).ok()
}
fn write_license(app: &AppHandle, rec: &LicenseRecord) {
    if let Some(p) = license_file(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(s) = serde_json::to_string_pretty(rec) {
            let _ = std::fs::write(p, s);
        }
    }
}
fn clear_license(app: &AppHandle) {
    if let Some(p) = license_file(app) {
        let _ = std::fs::remove_file(p);
    }
}

fn mask_key(key: &str) -> String {
    let tail: String = key.chars().rev().take(4).collect::<String>().chars().rev().collect();
    format!("•••• {tail}")
}

// Dev/test keys exercise the full activate→licensed→deactivate flow WITHOUT a
// Lemon Squeezy account (which is gated on the UK Ltd). Replaced by the real LS
// activation at go-live. "INSTADESK-TEST-LIFETIME…" / "INSTADESK-TEST-ANNUAL…".
fn parse_dev_key(key: &str) -> Option<&'static str> {
    let u = key.trim().to_uppercase();
    if u.starts_with("INSTADESK-TEST-LIFETIME") {
        Some("lifetime")
    } else if u.starts_with("INSTADESK-TEST-ANNUAL") {
        Some("annual")
    } else {
        None
    }
}

/// Activate a license key. Dev/test keys are honored locally; real keys will be
/// activated against Lemon Squeezy at go-live (the seam is marked below).
#[tauri::command]
pub fn license_activate(app: AppHandle, key: String) -> Result<Value, String> {
    if !licensing_enabled(&app) {
        return Err("Licensing is not enabled.".into());
    }
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Enter a license key.".into());
    }
    let now = now_secs();
    let kind = match parse_dev_key(&key) {
        Some(k) => k,
        None => {
            // === GO-LIVE SEAM ===
            // Real activation: POST https://api.lemonsqueezy.com/v1/licenses/activate
            // with { license_key: key, instance_name: <device label> } (NO API secret —
            // the key alone authorizes activation). Store the returned instance id +
            // license status + expires_at + activation_limit/usage. The store doesn't
            // exist yet, so real keys can't be activated during development.
            return Err(
                "Online activation isn't available yet (store not configured). Use a test key for now."
                    .into(),
            );
        }
    };
    let rec = LicenseRecord {
        key,
        kind: kind.to_string(),
        instance_id: format!("dev-{now:x}"),
        activated_unix: now,
        expires_unix: if kind == "annual" { Some(now + 365 * 86_400) } else { None },
        last_validated_unix: now,
    };
    write_license(&app, &rec);
    Ok(license_status(app))
}

/// Deactivate (free this device's seat) and clear the local license. At go-live
/// this also calls LS POST /licenses/deactivate before clearing.
#[tauri::command]
pub fn license_deactivate(app: AppHandle) -> Value {
    clear_license(&app);
    license_status(app)
}

/// The single evaluation both the UI status and the lock derive from. Returns
/// (state, the active license record if any). State: "unrestricted" (licensing
/// off) | "licensed" (lifetime, or annual within term) | "trial" | "expired".
fn evaluate(app: &AppHandle) -> (&'static str, Option<LicenseRecord>) {
    if !licensing_enabled(app) {
        return ("unrestricted", None);
    }
    if let Some(rec) = read_license(app) {
        let now = now_secs();
        let active = rec.kind == "lifetime" || rec.expires_unix.map(|e| now <= e).unwrap_or(true);
        if active {
            return ("licensed", Some(rec));
        }
        // Annual lapsed → fall through to the trial/expired computation.
    }
    if force_expired(app) {
        return ("expired", None);
    }
    let start = trial_start(app);
    let days_left = (TRIAL_DAYS - (now_secs() - start).max(0) / 86_400).max(0);
    (if days_left > 0 { "trial" } else { "expired" }, None)
}

/// Current license/trial status for the UI (and refreshes the cached lock). When
/// licensing is disabled (default), returns `enabled:false` → app unrestricted.
#[tauri::command]
pub fn license_status(app: AppHandle) -> Value {
    let (state, rec) = evaluate(&app);
    LICENSE_LOCKED.store(state == "expired", std::sync::atomic::Ordering::Relaxed);
    match state {
        "unrestricted" => json!({ "enabled": false, "state": "unrestricted" }),
        "licensed" => {
            let rec = rec.unwrap();
            json!({
                "enabled": true,
                "state": "licensed",
                "licenseType": rec.kind,
                "keyMasked": mask_key(&rec.key),
                "expiresUnix": rec.expires_unix,
                "devicesUsed": 1,
                "devicesMax": 3,
            })
        }
        _ => {
            let start = trial_start(&app);
            let days_left = (TRIAL_DAYS - (now_secs() - start).max(0) / 86_400).max(0);
            json!({
                "enabled": true,
                "state": state,
                "trialDaysTotal": TRIAL_DAYS,
                "trialDaysLeft": days_left,
                "trialStartedUnix": start,
            })
        }
    }
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
    fn dev_keys_parse_and_others_dont() {
        assert_eq!(parse_dev_key("instadesk-test-lifetime-abc"), Some("lifetime"));
        assert_eq!(parse_dev_key("INSTADESK-TEST-ANNUAL-xyz"), Some("annual"));
        assert_eq!(parse_dev_key("SOME-REAL-LS-KEY"), None);
        assert_eq!(mask_key("ABCD-1234-WXYZ"), "•••• WXYZ");
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

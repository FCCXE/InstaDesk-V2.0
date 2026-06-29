// The running app version, stamped at build time from src-tauri/tauri.conf.json
// (see vite.config.ts → VITE_APP_VERSION). Synchronous + always matches the
// shipped binary, so the header/Help footer never drift from the real version.
export const APP_VERSION: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0'

// True only in a SANDBOX build. src-tauri/scripts/sandbox.mjs sets INSTADESK_SANDBOX
// and vite.config.ts stamps VITE_INSTADESK_SANDBOX. Drives the mandatory on-screen
// SANDBOX badge (TopChrome) + disables auto-update (services/updater.ts). A
// build-time constant like APP_VERSION, so it never drifts from the shipped binary.
export const IS_SANDBOX: boolean = import.meta.env.VITE_INSTADESK_SANDBOX === true

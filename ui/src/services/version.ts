// The running app version, stamped at build time from src-tauri/tauri.conf.json
// (see vite.config.ts → VITE_APP_VERSION). Synchronous + always matches the
// shipped binary, so the header/Help footer never drift from the real version.
export const APP_VERSION: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0'

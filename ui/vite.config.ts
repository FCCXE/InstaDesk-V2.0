import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Single source of truth for the app version: src-tauri/tauri.conf.json (the
// same file the bundler stamps into the binary). Injected as VITE_APP_VERSION so
// the UI (header + Help footer) and telemetry all report the real shipped
// version, and it can never drift from a hand-typed string again.
import tauriConf from '../src-tauri/tauri.conf.json'

const appVersion = (tauriConf as { version?: string }).version ?? '0.0.0'

// SANDBOX flavor flag. Set by src-tauri/scripts/sandbox.mjs (INSTADESK_SANDBOX=1)
// when building the isolated side-by-side sandbox app. Stamped into the UI so it
// renders the mandatory on-screen SANDBOX badge (TopChrome) and disables
// auto-update (services/updater.ts). A normal build stamps `false`.
// Read via globalThis (no @types/node dependency needed for this config file).
const isSandbox =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.INSTADESK_SANDBOX === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_INSTADESK_SANDBOX': JSON.stringify(isSandbox),
  },
})

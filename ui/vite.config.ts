import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Single source of truth for the app version: src-tauri/tauri.conf.json (the
// same file the bundler stamps into the binary). Injected as VITE_APP_VERSION so
// the UI (header + Help footer) and telemetry all report the real shipped
// version, and it can never drift from a hand-typed string again.
import tauriConf from '../src-tauri/tauri.conf.json'

const appVersion = (tauriConf as { version?: string }).version ?? '0.0.0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
})

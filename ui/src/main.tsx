// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './state/ThemeProvider.tsx'
import { ConfirmProvider } from './components/common/ConfirmDialog.tsx'
import { initTelemetry, captureError, ErrorBoundary, identifyInstall, getInstallId, track } from './services/telemetry'
import './i18n'        // ✅ initialize i18next (EN/ES) before render
import './index.css'   // ✅ Ensure Tailwind is loaded here

// Start telemetry before render so early errors are captured. No-op without keys.
initTelemetry()
identifyInstall(getInstallId())
track('app_opened', { version: import.meta.env.VITE_APP_VERSION })

// Minimal crash fallback so a fatal render error shows a recoverable message
// instead of a blank window (and is reported to Sentry when telemetry is on).
function CrashFallback() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#0d1622' }}>
      <h2 style={{ margin: '0 0 8px' }}>InstaDesk hit an unexpected error</h2>
      <p style={{ margin: '0 0 16px', color: '#33445a' }}>
        Please restart the app. If it keeps happening, let us know via Help.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #cbd5e1', cursor: 'pointer' }}
      >
        Reload
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<CrashFallback />} onError={(e) => captureError(e)}>
      <ThemeProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

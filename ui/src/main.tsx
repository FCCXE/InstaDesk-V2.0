// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './state/ThemeProvider.tsx'
import { ConfirmProvider } from './components/common/ConfirmDialog.tsx'
import './i18n'        // ✅ initialize i18next (EN/ES) before render
import './index.css'   // ✅ Ensure Tailwind is loaded here

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

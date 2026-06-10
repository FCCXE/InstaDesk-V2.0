// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from './state/ThemeProvider.tsx'
import './index.css'   // ✅ Ensure Tailwind is loaded here

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)

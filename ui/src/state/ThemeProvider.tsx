// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\state\ThemeProvider.tsx
//
// Dark-theme runtime switch (Step 2/14 of the dark-theme build plan).
//
// Holds the user's theme *setting* ('light' | 'dark' | 'system'), persists
// it to localStorage, resolves 'system' against the OS preference, and
// writes the result to <html data-theme="..."> — which the CSS token
// overrides in index.css key off. The Settings → Theme picker (Step 3)
// drives setTheme(); components read nothing from here (they re-theme via
// CSS), so this is pure plumbing with no visual change on its own.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react'

export type ThemeSetting = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'instadesk:theme'

type ThemeContextValue = {
  /** The user's chosen setting (may be 'system'). */
  theme: ThemeSetting
  /** The actually-applied theme after resolving 'system'. */
  resolved: ResolvedTheme
  setTheme: (t: ThemeSetting) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function readStored(): ThemeSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  // Default during the dark-theme build: Light, so a fresh install never
  // auto-loads the still-incomplete dark theme. Flip this to 'system' at
  // Step 14 (polish), once the sweep is done.
  return 'light'
}

function resolve(setting: ThemeSetting): ResolvedTheme {
  if (setting === 'system') return prefersDark() ? 'dark' : 'light'
  return setting
}

function apply(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(readStored)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()))

  // Apply the resolved theme to <html> whenever the setting changes.
  useEffect(() => {
    const r = resolve(theme)
    setResolved(r)
    apply(r)
  }, [theme])

  // In 'system' mode, follow live OS light/dark changes.
  useEffect(() => {
    if (theme !== 'system') return
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? 'dark' : 'light'
      setResolved(r)
      apply(r)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: ThemeSetting) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* ignore persistence failure */
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}

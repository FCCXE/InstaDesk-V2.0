// Rebindable global-hotkey helper. Rust registers the defaults at startup; the
// Settings rebinder overrides Show/Snap via api.setHotkey, persists the choice in
// localStorage, and applySavedHotkeys() re-applies it on the next launch.
// (The Quick-Preset digit hotkeys are fixed — not rebindable.)
import { api } from './api'

export type HotkeyParts = { ctrl: boolean; alt: boolean; shift: boolean; sup: boolean; code: string }
export type HotkeyAction = 'show' | 'snap'

const DEFAULTS: Record<HotkeyAction, HotkeyParts> = {
  show: { ctrl: true, alt: true, shift: false, sup: false, code: 'KeyD' },
  snap: { ctrl: true, alt: true, shift: false, sup: false, code: 'KeyS' },
}

const storageKey = (a: HotkeyAction) => `instadesk:hotkey:${a}`

export function defaultBinding(action: HotkeyAction): HotkeyParts {
  return DEFAULTS[action]
}

export function loadBinding(action: HotkeyAction): HotkeyParts {
  try {
    const raw = localStorage.getItem(storageKey(action))
    if (raw) return JSON.parse(raw) as HotkeyParts
  } catch {
    /* fall through to default */
  }
  return DEFAULTS[action]
}

export function saveBinding(action: HotkeyAction, parts: HotkeyParts): void {
  try {
    localStorage.setItem(storageKey(action), JSON.stringify(parts))
  } catch {
    /* ignore */
  }
}

function sameParts(a: HotkeyParts, b: HotkeyParts): boolean {
  return a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.sup === b.sup && a.code === b.code
}

/** Human display, e.g. "Ctrl + Alt + D". */
export function formatBinding(p: HotkeyParts): string {
  const parts: string[] = []
  if (p.ctrl) parts.push('Ctrl')
  if (p.alt) parts.push('Alt')
  if (p.shift) parts.push('Shift')
  if (p.sup) parts.push('Super')
  const key = p.code.startsWith('Key')
    ? p.code.slice(3)
    : p.code.startsWith('Digit')
      ? p.code.slice(5)
      : p.code
  parts.push(key)
  return parts.join(' + ')
}

/** Re-apply any custom (non-default) Show/Snap bindings to the native registrar
 *  on app load. Defaults are already registered by Rust at startup, so we only
 *  re-register the ones the user changed. No-op in web / on failure. */
export async function applySavedHotkeys(): Promise<void> {
  for (const action of ['show', 'snap'] as HotkeyAction[]) {
    const p = loadBinding(action)
    if (!sameParts(p, DEFAULTS[action])) {
      try {
        await api.setHotkey(action, p)
      } catch {
        /* a stale/conflicting binding shouldn't break startup */
      }
    }
  }
}

// "Add Browser" picker — the styled replacement for the native prompt() that
// asked the user to TYPE a browser name. Lists the browsers actually installed
// on the machine (native registry detection via api.listBrowsers), each
// resolving to a real exe, plus a "Browse for .exe…" fallback for anything not
// auto-detected. Picking one hands back { name, path } so URL groups can truly
// launch that browser.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type BrowserInfo } from '../../services/api'

// Mirror BrowseAppModal's loader so the "Browse for .exe" fallback uses the same
// native file dialog (no-op outside Tauri / if the dialog plugin is unavailable).
type OpenDialogFn = (opts?: any) => Promise<string | string[] | null>
async function loadTauriOpen(): Promise<OpenDialogFn | null> {
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ != null
  if (!isTauri) return null
  try {
    const base = '@tauri-apps/api'
    const mod: any = await import(/* @vite-ignore */ (base + '/dialog'))
    return (mod?.open ?? null) as OpenDialogFn | null
  } catch {
    const globalOpen = (window as any).__TAURI__?.dialog?.open
    return typeof globalOpen === 'function' ? (globalOpen as OpenDialogFn) : null
  }
}

function inferName(p: string): string {
  const base = p.replace(/\\/g, '/').split('/').pop() || ''
  return base.replace(/\.exe$/i, '').trim() || 'Browser'
}

export default function BrowserPickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (entry: { name: string; path: string }) => void
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [detected, setDetected] = useState<BrowserInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  // Detect on open.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(null)
    api
      .listBrowsers()
      .then(list => {
        if (alive) setDetected(list)
      })
      .catch(() => {
        if (alive) setError(t('urls.browserDetectError'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, t])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pick = (entry: { name: string; path: string }) => {
    onPick(entry)
    onClose()
  }

  const browseForExe = async () => {
    const openDlg = await loadTauriOpen()
    if (!openDlg) return
    const res = await openDlg({
      multiple: false,
      filters: [{ name: 'Programs', extensions: ['exe'] }],
    })
    const path = Array.isArray(res) ? res[0] : res
    if (path) pick({ name: inferName(path), path })
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-fg">{t('urls.addBrowserTitle')}</h2>
        <p className="mt-1 text-xs text-muted">{t('urls.addBrowserSubtitle')}</p>

        <div className="mt-3 max-h-[260px] overflow-y-auto rounded-lg border border-line">
          {loading && <div className="p-3 text-sm text-muted">{t('urls.browserDetecting')}</div>}
          {!loading && error && <div className="p-3 text-sm text-red-500">{error}</div>}
          {!loading && !error && detected.length === 0 && (
            <div className="p-3 text-sm text-muted">{t('urls.browserNoneDetected')}</div>
          )}
          {!loading &&
            detected.map(b => (
              <button
                key={b.path}
                type="button"
                onClick={() => pick(b)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-raised"
              >
                <span className="text-sm font-medium text-fg">{b.name}</span>
                <span className="max-w-full truncate text-[11px] text-muted">{b.path}</span>
              </button>
            ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={browseForExe}
            className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium text-fg hover:bg-line/60"
          >
            {t('urls.browserBrowseOther')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium text-fg hover:bg-line/60"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

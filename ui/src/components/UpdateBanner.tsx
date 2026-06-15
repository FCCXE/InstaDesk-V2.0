import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { checkForUpdate, installUpdate, type Update } from '../services/updater'
import { inTauri } from '../services/api'
import { track } from '../services/telemetry'

// Auto-update notification. Quietly checks the signed release endpoint on launch
// (after a short delay so it never blocks first paint) and every 6 hours while
// the app stays open. When a newer version is found it shows a slim, dismissible
// bar at the top of the dashboard with a one-click "Install & restart". Failures
// (offline / endpoint hiccup) are silent — the manual Settings → Updates check
// covers those. "Later" hides the bar for that specific version only.

const RECHECK_MS = 6 * 60 * 60 * 1000 // 6 hours
const FIRST_CHECK_DELAY_MS = 4000
const DISMISS_KEY = 'instadesk.update.dismissed'

export default function UpdateBanner() {
  const { t } = useTranslation()
  const [update, setUpdate] = useState<Update | null>(null)
  const [installing, setInstalling] = useState(false)
  const [err, setErr] = useState('')
  // Version the user chose "Later" on — don't nag again until a newer one ships.
  const dismissedRef = useRef<string>(
    (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY)) || '',
  )

  useEffect(() => {
    if (!inTauri()) return
    let alive = true
    const run = async () => {
      try {
        const u = await checkForUpdate()
        if (!alive) return
        if (u && u.version !== dismissedRef.current) {
          setUpdate(u)
        }
      } catch {
        // silent — offline / endpoint error; manual check still available
      }
    }
    const first = setTimeout(run, FIRST_CHECK_DELAY_MS)
    const iv = setInterval(run, RECHECK_MS)
    return () => {
      alive = false
      clearTimeout(first)
      clearInterval(iv)
    }
  }, [])

  if (!update) return null

  const onInstall = async () => {
    if (installing) return
    setInstalling(true)
    setErr('')
    try {
      track('update_banner_install', { version: update.version })
      await installUpdate(update) // downloads, installs, relaunches
    } catch (e) {
      setErr(String((e as Error)?.message ?? e))
      setInstalling(false)
    }
  }

  const onLater = () => {
    try {
      localStorage.setItem(DISMISS_KEY, update.version)
    } catch {
      /* ignore */
    }
    dismissedRef.current = update.version
    setUpdate(null)
  }

  return (
    <div className="flex items-center gap-3 border-b border-primary/30 bg-primary/10 px-4 py-1.5 text-xs">
      <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
      <span className="min-w-0 flex-1 truncate font-medium text-fg">
        {err ? err : t('updateBanner.available', { version: update.version })}
      </span>
      <button
        type="button"
        onClick={onInstall}
        disabled={installing}
        className="shrink-0 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1 font-medium text-primary hover:bg-primary/25 disabled:opacity-50 dark:text-sky-300"
      >
        {installing ? t('updateBanner.installing') : t('updateBanner.install')}
      </button>
      <button
        type="button"
        onClick={onLater}
        disabled={installing}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-muted hover:text-fg disabled:opacity-50"
      >
        {t('updateBanner.later')}
      </button>
    </div>
  )
}

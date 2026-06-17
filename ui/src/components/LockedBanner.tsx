import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, inTauri, type LicenseStatus } from '../services/api'

// Trial-ended banner. Shows only when licensing is enabled AND the trial has
// expired with no active license (state === "expired"). Polling license_status
// also keeps the native lock current (the command refreshes it), so the gate
// engages even if the trial lapses mid-session. Dormant by default → renders
// nothing for normal users.
const POLL_MS = 5 * 60 * 1000

export default function LockedBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    if (!inTauri()) return
    let alive = true
    const run = () => { api.licenseStatus().then(s => { if (alive) setStatus(s) }).catch(() => {}) }
    run()
    const iv = setInterval(run, POLL_MS)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  if (!status?.enabled || status.state !== 'expired') return null

  return (
    <div className="flex items-center gap-3 border-b border-red-400/40 bg-red-500/10 px-4 py-1.5 text-xs">
      <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
      <span className="min-w-0 flex-1 font-medium text-red-700 dark:text-red-300">
        {t('locked.banner')}
      </span>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type HealthResponse } from '../services/api'
import { APP_VERSION, IS_SANDBOX } from '../services/version'
import { useTheme } from '../state/ThemeProvider'
import { useTour } from '../tour/TourProvider'

type ServerStatus =
  | { kind: 'checking' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'down'; reason: string }

export default function TopChrome() {
  const [status, setStatus] = useState<ServerStatus>({ kind: 'checking' })
  const { t } = useTranslation()
  const { resolved } = useTheme()
  const { openMenu } = useTour()
  // Swap to the white-text logo variants in dark mode (the default logos
  // have dark-navy wordmarks that vanish on a dark background).
  const instadeskLogo = resolved === 'dark' ? '/brand/instadesk-dark.png' : '/brand/instadesk.png'
  // Company logo (FCLX Studios). White-text variant in dark mode, black-text in light.
  const fclxLogo = resolved === 'dark' ? '/brand/fclx-dark.png' : '/brand/fclx.png'

  useEffect(() => {
    let alive = true
    const probe = async () => {
      try {
        const data = await api.health()
        if (alive) setStatus({ kind: 'ok', data })
      } catch (e) {
        if (alive) setStatus({ kind: 'down', reason: (e as Error).message })
      }
    }
    probe()
    const id = setInterval(probe, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const dot =
    status.kind === 'checking' ? { color: 'bg-gray-300 dark:bg-slate-600', label: t('header.checkingServer') } :
    status.kind === 'ok' && status.data.agentExists ? { color: 'bg-emerald-500', label: t('header.serverOk', { path: status.data.agentPath }) } :
    status.kind === 'ok' ? { color: 'bg-amber-500', label: t('header.agentMissing', { path: status.data.agentPath }) } :
    { color: 'bg-red-500', label: t('header.serverUnreachable', { base: api.base, reason: status.reason }) }

  return (
    <header className="h-14 border-b border-line bg-surface grid grid-cols-3 items-center px-4">
      {/* Left: InstaDesk logo (+ SANDBOX badge in sandbox builds) */}
      <div className="flex items-center min-w-0 gap-3">
        <img
          src={instadeskLogo}
          alt="InstaDesk"
          className="max-h-8 object-contain select-none"
          draggable={false}
        />
        {IS_SANDBOX && (
          <span
            className="px-2.5 py-1 rounded-md text-[0.7rem] font-extrabold uppercase
                       tracking-wider text-white bg-orange-600 shadow-sm select-none
                       whitespace-nowrap"
            title="Isolated SANDBOX build — NOT the live app. Used to validate new versions before release."
            aria-label="Sandbox build"
          >
            Sandbox
          </span>
        )}
      </div>

      {/* Center: Dashboard button */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          data-tour="dashboard-button"
          className="px-5 py-2 text-[0.95rem] font-semibold text-on-primary
                     bg-primary hover:bg-primary-hover
                     rounded-lg shadow-md transition-colors
                     scale-110"
        >
          {t('header.dashboard')}
        </button>
      </div>

      {/* Right: Guided Tour + server status dot + version + FCLX logo */}
      <div className="flex items-center justify-end gap-3">
        {/* The Guided Tour is a fundamental control, so it gets the accent
            treatment Snap uses rather than ghost styling — a help entry point
            nobody notices is worth nothing. */}
        <button
          type="button"
          data-tour="guided-tour-button"
          onClick={openMenu}
          title={t('tour.guidedTourTitle')}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm transition-colors hover:border-violet-400 hover:bg-violet-100 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-300 dark:shadow-[0_0_12px_rgba(34,211,238,0.25)] dark:hover:border-cyan-300 dark:hover:bg-cyan-400/20"
        >
          <span aria-hidden>🧭</span>
          {t('tour.guidedTour')}
        </button>
        <div data-tour="version-status" className="flex items-center gap-2 text-xs text-muted">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${dot.color}`}
          title={dot.label}
          aria-label={dot.label}
        />
        <span>v{APP_VERSION} • {status.kind === 'ok' && status.data.agentExists ? t('header.live') : t('header.static')}</span>
        <span className="text-muted">{t('header.by')}</span>
        <img
          src={fclxLogo}
          alt="FCLX Studios"
          className="max-h-7 object-contain select-none"
          draggable={false}
        />
        </div>
      </div>
    </header>
  )
}

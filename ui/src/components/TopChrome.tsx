import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type HealthResponse } from '../services/api'
import { useTheme } from '../state/ThemeProvider'

type ServerStatus =
  | { kind: 'checking' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'down'; reason: string }

export default function TopChrome() {
  const [status, setStatus] = useState<ServerStatus>({ kind: 'checking' })
  const { t } = useTranslation()
  const { resolved } = useTheme()
  // Swap to the white-text logo variants in dark mode (the default logos
  // have dark-navy wordmarks that vanish on a dark background).
  const instadeskLogo = resolved === 'dark' ? '/brand/instadesk-dark.png' : '/brand/instadesk.png'
  const fcxeLogo = resolved === 'dark' ? '/brand/fcxe-dark.png' : '/brand/fcxe.png'

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
    status.kind === 'checking' ? { color: 'bg-gray-300', label: t('header.checkingServer') } :
    status.kind === 'ok' && status.data.agentExists ? { color: 'bg-emerald-500', label: t('header.serverOk', { path: status.data.agentPath }) } :
    status.kind === 'ok' ? { color: 'bg-amber-500', label: t('header.agentMissing', { path: status.data.agentPath }) } :
    { color: 'bg-red-500', label: t('header.serverUnreachable', { base: api.base, reason: status.reason }) }

  return (
    <header className="h-14 border-b border-line bg-surface grid grid-cols-3 items-center px-4">
      {/* Left: InstaDesk logo */}
      <div className="flex items-center min-w-0">
        <img
          src={instadeskLogo}
          alt="InstaDesk"
          className="max-h-8 object-contain select-none"
          draggable={false}
        />
      </div>

      {/* Center: Dashboard button */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          className="px-5 py-2 text-[0.95rem] font-semibold text-on-primary
                     bg-primary hover:bg-primary-hover
                     rounded-lg shadow-md transition-colors
                     scale-110"
        >
          {t('header.dashboard')}
        </button>
      </div>

      {/* Right: server status dot + version + FcXe logo */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${dot.color}`}
          title={dot.label}
          aria-label={dot.label}
        />
        <span>v0.1 • {status.kind === 'ok' && status.data.agentExists ? t('header.live') : t('header.static')}</span>
        <span className="text-muted">{t('header.by')}</span>
        <img
          src={fcxeLogo}
          alt="FcXe Studios"
          className="max-h-7 object-contain select-none"
          draggable={false}
        />
      </div>
    </header>
  )
}

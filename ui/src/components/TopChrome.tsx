import { useEffect, useState } from 'react'
import { api, type HealthResponse } from '../services/api'

type ServerStatus =
  | { kind: 'checking' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'down'; reason: string }

export default function TopChrome() {
  const [status, setStatus] = useState<ServerStatus>({ kind: 'checking' })

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
    status.kind === 'checking' ? { color: 'bg-gray-300', label: 'Checking server…' } :
    status.kind === 'ok' && status.data.agentExists ? { color: 'bg-emerald-500', label: `Server OK • agent at ${status.data.agentPath}` } :
    status.kind === 'ok' ? { color: 'bg-amber-500', label: `Server up but agent missing: ${status.data.agentPath}` } :
    { color: 'bg-red-500', label: `Server unreachable (${api.base}) — ${status.reason}` }

  return (
    <header className="h-14 border-b border-gray-200 bg-white grid grid-cols-3 items-center px-4">
      {/* Left: InstaDesk logo */}
      <div className="flex items-center min-w-0">
        <img
          src="/brand/instadesk.png"
          alt="InstaDesk"
          className="max-h-8 object-contain select-none"
          draggable={false}
        />
      </div>

      {/* Center: Dashboard button */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          className="px-5 py-2 text-[0.95rem] font-semibold text-white
                     bg-[#199CFF] hover:bg-[#1380CC]
                     rounded-lg shadow-md transition-colors
                     scale-110"
        >
          DASHBOARD
        </button>
      </div>

      {/* Right: server status dot + version + FcXe logo */}
      <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${dot.color}`}
          title={dot.label}
          aria-label={dot.label}
        />
        <span>v0.1 • {status.kind === 'ok' && status.data.agentExists ? 'live' : 'static'}</span>
        <span className="text-gray-400">by</span>
        <img
          src="/brand/fcxe.png"
          alt="FcXe Studios"
          className="max-h-7 object-contain select-none"
          draggable={false}
        />
      </div>
    </header>
  )
}

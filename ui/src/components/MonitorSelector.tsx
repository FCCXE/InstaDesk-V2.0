import React from 'react'
import { useAppState } from '../state/AppState'
import type { PresetId } from '../state/AppState'
import DisplayArray from './DisplayArray'

export default function MonitorSelector() {
  const {
    monitors, currentMonitorId, setCurrentMonitor,
    presets, getPendingPreset, setPendingPreset,
  } = useAppState()

  const current = monitors.find((m) => m.id === currentMonitorId)!
  const activeCount = monitors.filter((m) => m.active).length

  // Quick Presets (visual + minimal state)
  const [open, setOpen] = React.useState(false)
  const pending = getPendingPreset(currentMonitorId)
  const handleChoose = (pid: PresetId) => {
    setPendingPreset(currentMonitorId, pid)
    setOpen(false)
  }

  // Normalize chip order so M1..M4 map to Monitor 1..4 (labels unchanged)
  const chipMonitors = React.useMemo(() => {
    const getNum = (name: string) => {
      const m = name.match(/(\d+)\s*$/)
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
    }
    return [...monitors].sort((a, b) => {
      const an = getNum(a.name)
      const bn = getNum(b.name)
      if (an !== bn) return an - bn
      return a.name.localeCompare(b.name)
    })
  }, [monitors])

  // Demo presets for scrollbar validation (disabled; visuals only)
  const demoPresets: { id: PresetId; name: string; note?: string; _demo?: true }[] = [
    { id: 'DEMO-FOCUS' as PresetId, name: 'Focus Sprint', note: 'No alerts (demo)', _demo: true },
    { id: 'DEMO-REVIEW' as PresetId, name: 'Review / Docs', note: 'Docs & mail (demo)', _demo: true },
  ]
  const menuPresets = React.useMemo(
    () => [...presets, ...demoPresets],
    [presets]
  )

  return (
    <aside className="rounded-2xl border border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))] p-4 shadow-[var(--id-shadow)]">
      {/* ------------------------------------------------------------------ */}
      {/*  QUICK PRESETS (MOVED TO TOP)                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-gray-700">Quick Presets</div>
          <button className="text-[11px] text-gray-500 hover:text-gray-700" disabled title="Coming soon">
            Manage
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
          >
            <span>{pending ? displayPresetName(pending, presets) : 'Choose a preset (up to 6)'}</span>
            <span aria-hidden>▾</span>
          </button>

          {open && (
            <div
              className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white p-1 shadow-lg ring-1 ring-gray-200
                         max-h-36 overflow-y-auto"  /* ~3 items tall; scrolls for more */
              role="menu"
            >
              {menuPresets.map((p) => {
                const isDemo = (p as any)._demo
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => !isDemo && handleChoose(p.id as PresetId)}
                    className={[
                      'flex w-full items-center justify-between rounded-md px-2 py-2 text-sm',
                      isDemo ? 'cursor-not-allowed text-gray-400' : 'hover:bg-gray-50 text-gray-800'
                    ].join(' ')}
                    role="menuitem"
                    disabled={!!isDemo}
                    title={isDemo ? 'Demo item for scrollbar preview' : undefined}
                  >
                    <span>{p.name}</span>
                    {'note' in p && p.note && <span className="text-[11px] text-gray-500">{p.note}</span>}
                  </button>
                )
              })}
              {/* sticky ending border for clear visual termination */}
              <div className="sticky bottom-0 mt-1 h-px bg-gray-200" />
            </div>
          )}
        </div>

        <div className="mt-2 text-[11px] text-gray-500">
          {pending
            ? <>Selected preset: <span className="font-medium text-gray-700">{displayPresetName(pending, presets)}</span> <span className="text-gray-400">(pending)</span></>
            : <>No preset selected</>}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  MONITOR SELECTION (NOW BELOW QUICK PRESETS)                       */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-gray-700">Monitor Selection</div>

        {/* Selector (sorted to match chips) */}
        <div className="mb-2">
          <select
            value={currentMonitorId}
            onChange={(e) => setCurrentMonitor(e.target.value)}
            className="w-full rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm"
          >
            {chipMonitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Short spec line */}
        <div className="text-[12px] text-[rgb(var(--id-text-muted))]">
          {current.resolution} {current.role}
        </div>

        {/* Info card */}
        <div className="mt-3 rounded-xl border border-[rgb(var(--id-border))] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2">
              <span className={`inline-block size-2 rounded-full ${current.active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <span>{current.name}</span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                current.active
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {current.active ? 'Active' : 'Inactive'}
            </span>
          </div>

          <dl className="mt-3 space-y-1 text-[12px] text-[rgb(var(--id-text-muted))]">
            <div className="flex justify-between">
              <dt>Role:</dt>
              <dd>{current.role}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Resolution:</dt>
              <dd>{current.resolution}</dd>
            </div>
          </dl>
        </div>

        {/* Chip bar (live, clickable) */}
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-gray-500">Monitors</div>
          <div className="flex flex-wrap gap-2">
            {chipMonitors.map((m, i) => {
              const label = `M${i + 1}`
              const isCurrent = m.id === currentMonitorId
              const active = m.active
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCurrentMonitor(m.id)}
                  className={[
                    'h-6 rounded-full px-2 text-xs font-medium ring-1 transition',
                    active
                      ? 'bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100'
                      : 'bg-white text-gray-500 ring-gray-200 hover:bg-gray-50',
                    isCurrent ? 'ring-2 ring-offset-1 ring-offset-white' : '',
                  ].join(' ')}
                  title={`${m.name}${active ? ' (Active)' : ' (Inactive)'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tally */}
        <div className="mt-2 text-[11px] text-[rgb(var(--id-text-muted))]">
          Active Monitors: {activeCount}/{monitors.length}
        </div>

        {/* Display Array */}
        <DisplayArray />
      </div>
    </aside>
  )
}

function displayPresetName(id: PresetId, list: { id: PresetId; name: string }[]) {
  return list.find(p => p.id === id)?.name ?? id
}

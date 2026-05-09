import React, { useCallback, useEffect, useState } from 'react'
import { useAppState } from '../state/AppState'
import { api, type PresetListItem } from '../services/api'
import DisplayArray from './DisplayArray'

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; msg: string }
  | { kind: 'err'; msg: string }

function presetLabel(p: PresetListItem) {
  return `${p.kind === 'general' ? 'Layout' : 'Single'} ${p.slot}`
}

export default function MonitorSelector() {
  const { monitors, currentMonitorId, setCurrentMonitor } = useAppState()

  const current = monitors.find((m) => m.id === currentMonitorId)!
  const activeCount = monitors.filter((m) => m.active).length

  /* -------------------- Quick Presets (real data) -------------------- */
  const [presets, setPresets] = useState<PresetListItem[] | null>(null)
  const [selected, setSelected] = useState<PresetListItem | null>(null)
  const [applyState, setApplyState] = useState<ApplyState>({ kind: 'idle' })
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await api.presetsList()
      const items = res.presets.filter((p) => p.kind === 'general' && p.slot)
      setPresets(items)
      // Drop selection if the underlying preset was deleted.
      setSelected((prev) =>
        prev && items.some((i) => i.kind === prev.kind && i.slot === prev.slot) ? prev : null
      )
    } catch {
      setPresets([])
    }
  }, [])

  useEffect(() => {
    refresh()
    const onChanged = () => refresh()
    window.addEventListener('insta:presets-changed', onChanged)
    return () => window.removeEventListener('insta:presets-changed', onChanged)
  }, [refresh])

  const flash = (s: ApplyState) => {
    setApplyState(s)
    if (s.kind === 'ok' || s.kind === 'err') {
      window.setTimeout(() => setApplyState({ kind: 'idle' }), 2400)
    }
  }

  const onApply = async () => {
    if (!selected) return
    flash({ kind: 'busy' })
    try {
      const r = await api.presetsRun(selected.kind, selected.slot)
      const failures = r.results.filter((x) => x.exitCode !== 0)
      if (failures.length === 0) {
        flash({
          kind: 'ok',
          msg: `Applied ${presetLabel(selected)} • ${r.results.length} window${r.results.length === 1 ? '' : 's'}`,
        })
      } else {
        flash({
          kind: 'err',
          msg: `${failures.length}/${r.results.length} failed`,
        })
      }
    } catch (e) {
      flash({ kind: 'err', msg: (e as Error).message })
    }
  }

  const onManage = () => {
    // Tell the right pane to switch to the Layouts tab.
    window.dispatchEvent(new CustomEvent('insta:open-layouts-tab'))
  }

  const handleChoose = (p: PresetListItem) => {
    setSelected(p)
    setOpen(false)
  }

  /* -------------------- Monitor chip ordering -------------------- */
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

  const isApplying = applyState.kind === 'busy'
  const statusText =
    applyState.kind === 'busy' ? 'Applying…' :
    applyState.kind === 'ok' ? applyState.msg :
    applyState.kind === 'err' ? `Error: ${applyState.msg}` :
    selected ? `Selected: ${presetLabel(selected)}` :
    presets === null ? 'Loading…' :
    presets.length === 0 ? 'No saved layouts. Save one in the Layouts tab.' :
    'No preset selected'
  const statusColor =
    applyState.kind === 'err' ? 'text-red-600' :
    applyState.kind === 'ok' ? 'text-emerald-600' :
    applyState.kind === 'busy' ? 'text-sky-600' :
    'text-gray-500'

  return (
    <aside className="rounded-2xl border border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))] p-4 shadow-[var(--id-shadow)]">
      {/* ---------------------------------------------------- */}
      {/*  QUICK PRESETS                                       */}
      {/* ---------------------------------------------------- */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-gray-700">Quick Presets</div>
          <button
            type="button"
            onClick={onManage}
            className="text-[11px] text-sky-600 hover:text-sky-800"
            title="Open the Layouts tab"
          >
            Manage
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={presets !== null && presets.length === 0}
              className="flex w-full items-center justify-between rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="truncate">
                {selected ? presetLabel(selected) : 'Choose a saved layout'}
              </span>
              <span aria-hidden>▾</span>
            </button>

            {open && presets && presets.length > 0 && (
              <div
                className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white p-1 shadow-lg ring-1 ring-gray-200 max-h-44 overflow-y-auto"
                role="menu"
              >
                {presets.map((p) => (
                  <button
                    key={`${p.kind}/${p.slot}`}
                    type="button"
                    onClick={() => handleChoose(p)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-gray-50 text-gray-800"
                    role="menuitem"
                    title={p.path}
                  >
                    <span>{presetLabel(p)}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                      slot {p.slot}
                    </span>
                  </button>
                ))}
                <div className="sticky bottom-0 mt-1 h-px bg-gray-200" />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onApply}
            disabled={!selected || isApplying}
            className="shrink-0 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={selected ? `POST /presets/run kind=${selected.kind} slot=${selected.slot}` : 'Pick a preset first'}
          >
            {isApplying ? '…' : '▶ Apply'}
          </button>
        </div>

        <div className={`mt-2 text-[11px] ${statusColor}`}>{statusText}</div>
      </div>

      {/* ---------------------------------------------------- */}
      {/*  MONITOR SELECTION (UNCHANGED)                       */}
      {/* ---------------------------------------------------- */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-gray-700">Monitor Selection</div>

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

        <div className="text-[12px] text-[rgb(var(--id-text-muted))]">
          {current.resolution} {current.role}
        </div>

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

        <div className="mt-2 text-[11px] text-[rgb(var(--id-text-muted))]">
          Active Monitors: {activeCount}/{monitors.length}
        </div>

        <DisplayArray />
      </div>
    </aside>
  )
}

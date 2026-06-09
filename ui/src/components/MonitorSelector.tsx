import React, { useCallback, useEffect, useState } from 'react'
import { useAppState } from '../state/AppState'
import {
  api,
  type PresetListItem,
  type QuickPresetListItem,
} from '../services/api'
import DisplayArray from './DisplayArray'
import QuickPresetsManager from './quickpresets/QuickPresetsManager'

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; msg: string }
  | { kind: 'err'; msg: string }

// Dropdown entries — Quick Presets (composed bundles) or single Layouts.
type DropdownEntry =
  | { type: 'qp'; slot: string; name: string; layoutCount: number }
  | { type: 'layout'; layout: PresetListItem }

function entryKey(e: DropdownEntry): string {
  return e.type === 'qp' ? `qp/${e.slot}` : `layout/${e.layout.kind}/${e.layout.slot}`
}

function entryLabel(e: DropdownEntry): string {
  if (e.type === 'qp') return e.name
  return `${e.layout.kind === 'general' ? 'Layout' : 'Single'} ${e.layout.slot}`
}

export default function MonitorSelector() {
  const { monitors, currentMonitorId, setCurrentMonitor, windowMargin } = useAppState()

  const current = monitors.find((m) => m.id === currentMonitorId)!
  const activeCount = monitors.filter((m) => m.active).length

  /* -------------------- Quick Presets + Layouts (real data) -------------------- */
  const [layouts, setLayouts] = useState<PresetListItem[] | null>(null)
  const [quickpresets, setQuickpresets] = useState<QuickPresetListItem[] | null>(null)
  const [selected, setSelected] = useState<DropdownEntry | null>(null)
  const [applyState, setApplyState] = useState<ApplyState>({ kind: 'idle' })
  const [open, setOpen] = useState(false)
  const [qpManagerOpen, setQpManagerOpen] = useState(false)

  const refreshLayouts = useCallback(async () => {
    try {
      const res = await api.presetsList()
      const items = res.presets.filter((p) => p.kind === 'general' && p.slot)
      setLayouts(items)
    } catch {
      setLayouts([])
    }
  }, [])

  const refreshQuickPresets = useCallback(async () => {
    try {
      const res = await api.quickPresetsList()
      setQuickpresets(res.quickpresets)
    } catch {
      setQuickpresets([])
    }
  }, [])

  // Keep `selected` consistent with current lists (drop if underlying entry deleted).
  useEffect(() => {
    if (!selected) return
    if (selected.type === 'qp') {
      const stillExists = quickpresets?.some((q) => q.slot === selected.slot)
      if (quickpresets !== null && !stillExists) setSelected(null)
    } else {
      const stillExists = layouts?.some(
        (l) => l.kind === selected.layout.kind && l.slot === selected.layout.slot,
      )
      if (layouts !== null && !stillExists) setSelected(null)
    }
  }, [selected, layouts, quickpresets])

  useEffect(() => {
    refreshLayouts()
    refreshQuickPresets()
    const onLayoutsChanged = () => refreshLayouts()
    const onQpChanged = () => refreshQuickPresets()
    window.addEventListener('insta:presets-changed', onLayoutsChanged)
    window.addEventListener('insta:quickpresets-changed', onQpChanged)
    return () => {
      window.removeEventListener('insta:presets-changed', onLayoutsChanged)
      window.removeEventListener('insta:quickpresets-changed', onQpChanged)
    }
  }, [refreshLayouts, refreshQuickPresets])

  const flash = (s: ApplyState) => {
    setApplyState(s)
    if (s.kind === 'ok' || s.kind === 'err') {
      window.setTimeout(() => setApplyState({ kind: 'idle' }), 2800)
    }
  }

  const onApply = async () => {
    if (!selected) return
    flash({ kind: 'busy' })
    try {
      if (selected.type === 'layout') {
        const r = await api.presetsRun(selected.layout.kind, selected.layout.slot, windowMargin)
        const failures = r.results.filter((x) => x.exitCode !== 0)
        if (failures.length === 0) {
          flash({
            kind: 'ok',
            msg: `Applied ${entryLabel(selected)} • ${r.results.length} window${r.results.length === 1 ? '' : 's'}`,
          })
        } else {
          flash({ kind: 'err', msg: `${failures.length}/${r.results.length} failed` })
        }
        return
      }

      // Quick Preset: sequential Layouts on the server.
      const r = await api.quickPresetsRun(selected.slot, windowMargin)
      const okCount = r.layouts.filter((x) => x.ok).length
      const totalWindows = r.layouts.reduce(
        (sum, x) => sum + (x.results?.length ?? 0),
        0,
      )
      if (okCount === r.layouts.length) {
        flash({
          kind: 'ok',
          msg: `Applied ${r.quickpreset.name} • ${r.layouts.length} Layout${r.layouts.length === 1 ? '' : 's'} • ${totalWindows} window${totalWindows === 1 ? '' : 's'}`,
        })
      } else {
        const firstErr = r.layouts.find((x) => !x.ok)?.error
        flash({
          kind: 'err',
          msg: `${r.layouts.length - okCount}/${r.layouts.length} Layouts failed${firstErr ? ` — ${firstErr}` : ''}`,
        })
      }
    } catch (e) {
      flash({ kind: 'err', msg: (e as Error).message })
    }
  }

  const onOpenLayoutsTab = () => {
    window.dispatchEvent(new CustomEvent('insta:open-layouts-tab'))
  }

  const handleChoose = (e: DropdownEntry) => {
    setSelected(e)
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
  const hasAny = (layouts?.length ?? 0) > 0 || (quickpresets?.length ?? 0) > 0
  const loading = layouts === null || quickpresets === null

  const statusText =
    applyState.kind === 'busy' ? 'Applying…' :
    applyState.kind === 'ok' ? applyState.msg :
    applyState.kind === 'err' ? `Error: ${applyState.msg}` :
    selected ? `Selected: ${entryLabel(selected)}` :
    loading ? 'Loading…' :
    !hasAny ? 'No saved layouts. Save one in the Layouts tab.' :
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
        {/* Title row — Quick Presets label */}
        <div className="mb-2 flex items-center">
          <div className="text-[14px] font-semibold text-gray-800">Quick Presets</div>
        </div>

        {/* Action buttons row — proper buttons (not tertiary text links).
            'Manage QPs' is the primary entry point to compose / rename /
            delete Quick Preset bundles; gets a filled sky-blue pill.
            'Layouts ↗' is a secondary cross-link to the Layouts tab on
            the right pane; ghost-styled but still clearly clickable. */}
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQpManagerOpen(true)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 text-[12px] font-semibold text-sky-700 shadow-sm hover:bg-sky-100 hover:border-sky-400"
            title="Compose, rename, and delete Quick Presets (bundles of Layouts)"
          >
            <span aria-hidden>⚡</span>
            Manage QPs
          </button>
          <button
            type="button"
            onClick={onOpenLayoutsTab}
            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-[12px] font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-400"
            title="Open the Layouts tab on the right pane"
          >
            Layouts
            <span aria-hidden className="text-gray-400">↗</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={!loading && !hasAny}
              className="flex w-full items-center justify-between rounded-lg border border-[rgb(var(--id-border))] bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="truncate">
                {selected ? entryLabel(selected) : 'Choose a Quick Preset or Layout'}
              </span>
              <span aria-hidden>▾</span>
            </button>

            {open && hasAny && (
              <div
                className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white p-1 shadow-lg ring-1 ring-gray-200 max-h-64 overflow-y-auto"
                role="menu"
              >
                {quickpresets && quickpresets.length > 0 && (
                  <>
                    <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Quick Presets
                    </div>
                    {quickpresets.map((q) => {
                      const e: DropdownEntry = {
                        type: 'qp', slot: q.slot, name: q.name, layoutCount: q.layoutCount,
                      }
                      return (
                        <button
                          key={entryKey(e)}
                          type="button"
                          onClick={() => handleChoose(e)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-gray-50 text-gray-800"
                          role="menuitem"
                          title={q.path}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span aria-hidden className="text-purple-500">⚡</span>
                            <span className="truncate">{q.name}</span>
                          </span>
                          <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
                            {q.layoutCount} layout{q.layoutCount === 1 ? '' : 's'}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}

                {layouts && layouts.length > 0 && (
                  <>
                    {quickpresets && quickpresets.length > 0 && (
                      <div className="my-1 h-px bg-gray-100" />
                    )}
                    <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Layouts
                    </div>
                    {layouts.map((p) => {
                      const e: DropdownEntry = { type: 'layout', layout: p }
                      return (
                        <button
                          key={entryKey(e)}
                          type="button"
                          onClick={() => handleChoose(e)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-gray-50 text-gray-800"
                          role="menuitem"
                          title={p.path}
                        >
                          <span>{entryLabel(e)}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                            slot {p.slot}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onApply}
            disabled={!selected || isApplying}
            className="shrink-0 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              selected
                ? selected.type === 'qp'
                  ? `POST /quickpresets/run slot=${selected.slot}`
                  : `POST /presets/run kind=${selected.layout.kind} slot=${selected.layout.slot}`
                : 'Pick a preset first'
            }
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

        <div className="mt-3 text-[11px] text-[rgb(var(--id-text-muted))]">
          Active Monitors: {activeCount}/{monitors.length}
        </div>

        <DisplayArray />
      </div>

      {qpManagerOpen && (
        <QuickPresetsManager onClose={() => setQpManagerOpen(false)} />
      )}
    </aside>
  )
}

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { track } from '../services/telemetry'
import { useAppState } from '../state/AppState'
import {
  api,
  inTauri,
  type PresetListItem,
  type QuickPresetListItem,
  type SwitchWindowResult,
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

function entryLabel(e: DropdownEntry, t: TFunction): string {
  if (e.type === 'qp') return e.name
  return e.layout.kind === 'general'
    ? t('monitor.entryLayout', { slot: e.layout.slot })
    : t('monitor.entrySingle', { slot: e.layout.slot })
}

export default function MonitorSelector() {
  const { monitors, currentMonitorId, setCurrentMonitor, windowMargin, switchMode, setSwitchMode } = useAppState()
  const { t } = useTranslation()

  /* -------------------- Quick Presets + Layouts (real data) -------------------- */
  const [layouts, setLayouts] = useState<PresetListItem[] | null>(null)
  const [quickpresets, setQuickpresets] = useState<QuickPresetListItem[] | null>(null)
  const [selected, setSelected] = useState<DropdownEntry | null>(null)
  const [applyState, setApplyState] = useState<ApplyState>({ kind: 'idle' })
  const [open, setOpen] = useState(false)
  const [qpManagerOpen, setQpManagerOpen] = useState(false)
  // The windows a switch could NOT take down, kept until dismissed. The status
  // line flashes and clears after a few seconds, which is fine for "it worked"
  // and wrong for "something of yours is still open" — that has to stay put long
  // enough to be read and acted on.
  const [leftBehind, setLeftBehind] = useState<SwitchWindowResult[]>([])
  const [disagreements, setDisagreements] = useState<SwitchWindowResult[]>([])

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

  // Apply a Quick Preset by slot (sequential Layouts on the server). Shared by
  // the left-pane Apply button and the Ctrl+Alt+1..9 global hotkeys.
  const runQuickPreset = async (slot: string, source: 'manual' | 'hotkey' = 'manual') => {
    // Switch mode governs the TRANSITION, so it has to govern every way of
    // triggering one. If the button swapped but Ctrl+Alt+N still stacked, the
    // same setting would mean two different things depending on how you reached
    // it — the ambiguity the general-switch decision exists to avoid.
    if (switchMode) {
      const q = quickpresets?.find((x) => x.slot === slot)
      await runSwitch(
        { type: 'qp', slot, name: q?.name ?? slot, layoutCount: q?.layoutCount ?? 0 },
        source,
      )
      return
    }
    flash({ kind: 'busy' })
    try {
      const r = await api.quickPresetsRun(slot, windowMargin)
      const okCount = r.layouts.filter((x) => x.ok).length
      const totalWindows = r.layouts.reduce((sum, x) => sum + (x.results?.length ?? 0), 0)
      track('quickpreset_applied', { layouts: r.layouts.length, ok: okCount, windows: totalWindows, source })
      if (okCount === r.layouts.length) {
        flash({
          kind: 'ok',
          msg: `${t('monitor.appliedName', { name: r.quickpreset.name })} • ${t('monitor.layoutsRun', { count: r.layouts.length })} • ${t('monitor.windows', { count: totalWindows })}`,
        })
      } else {
        const firstErr = r.layouts.find((x) => !x.ok)?.error
        flash({
          kind: 'err',
          msg: t('monitor.qpLayoutsFailed', { failed: r.layouts.length - okCount, total: r.layouts.length, err: firstErr ? ` — ${firstErr}` : '' }),
        })
      }
    } catch (e) {
      flash({ kind: 'err', msg: (e as Error).message })
    }
  }

  // Switch mode: take the live preset down first, then apply this one. One path
  // serves a Quick Preset and a single Layout — what is live is whatever InstaDesk
  // last applied, either sort (decision D-5).
  const runSwitch = async (entry: DropdownEntry, source: 'manual' | 'hotkey' = 'manual') => {
    const kind = entry.type === 'qp' ? 'quickpreset' : entry.layout.kind
    const slot = entry.type === 'qp' ? entry.slot : entry.layout.slot
    // Clear the previous report first: a leftover list from an earlier switch
    // still on screen would be read as describing THIS one.
    setLeftBehind([])
    setDisagreements([])
    flash({ kind: 'busy' })
    try {
      const r = await api.quickPresetsSwitch(kind, slot, windowMargin)
      const c = r.teardown.counts
      const leftOver = c ? c.stillOpen + c.skippedElevated : 0
      track('quickpreset_switched', {
        kind,
        closed: c?.closed ?? 0,
        leftOpen: leftOver,
        placed: r.nowLive.windows,
        source,
      })
      // Name what survived, do not merely count it. `stillOpen` and
      // `skippedElevated` are the two the user can act on; `stale` needs no
      // mention (it was already gone) and `closed` speaks for itself.
      const survivors = (r.teardown.windows ?? []).filter(
        (w) => w.outcome === 'stillOpen' || w.outcome === 'skippedElevated',
      )
      setLeftBehind(survivors)
      setDisagreements(r.teardown.crossCheckDisagreements ?? [])

      const applied = t('monitor.appliedName', { name: entryLabel(entry, t) })
      // Report what became of the OLD preset, not merely that the new one landed.
      // A count of windows we asked to close is not a count of windows that
      // closed, and that difference is the whole point of the teardown report.
      const teardownMsg = !r.teardown.ran
        ? t('monitor.switchNothingLive')
        : `${t('monitor.switchedSummary', { closed: c?.closed ?? 0, requested: r.teardown.requested ?? 0 })}${
            leftOver > 0 ? ` • ${t('monitor.switchedLeftOpen', { count: leftOver })}` : ''
          }`
      flash({ kind: leftOver > 0 ? 'err' : 'ok', msg: `${applied} • ${teardownMsg}` })
    } catch (e) {
      flash({ kind: 'err', msg: (e as Error).message })
    }
  }

  const onApply = async () => {
    if (!selected) return
    if (switchMode) {
      await runSwitch(selected)
      return
    }
    if (selected.type !== 'layout') {
      await runQuickPreset(selected.slot)
      return
    }
    flash({ kind: 'busy' })
    try {
      const r = await api.presetsRun(selected.layout.kind, selected.layout.slot, windowMargin)
      const failures = r.results.filter((x) => x.exitCode !== 0)
      track('layout_applied', { kind: selected.layout.kind, windows: r.results.length, failures: failures.length, source: 'monitor' })
      if (failures.length === 0) {
        flash({
          kind: 'ok',
          msg: `${t('monitor.appliedName', { name: entryLabel(selected, t) })} • ${t('monitor.windows', { count: r.results.length })}`,
        })
      } else {
        flash({ kind: 'err', msg: t('monitor.layoutFailed', { failed: failures.length, total: r.results.length }) })
      }
    } catch (e) {
      flash({ kind: 'err', msg: (e as Error).message })
    }
  }

  // Apply a Quick Preset from the global hotkey (Ctrl+Alt+1..9 → slot A..I). A ref
  // keeps the listener pointed at the latest runQuickPreset without re-subscribing.
  const runQPRef = useRef(runQuickPreset)
  runQPRef.current = runQuickPreset
  useEffect(() => {
    if (!inTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('insta://hotkey/quickpreset', (e) => { void runQPRef.current(e.payload, 'hotkey') }))
      .then((u) => { unlisten = u })
      .catch(() => {})
    return () => { unlisten?.() }
  }, [])

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
    applyState.kind === 'busy' ? t('monitor.applying') :
    applyState.kind === 'ok' ? applyState.msg :
    applyState.kind === 'err' ? t('monitor.errorPrefix', { msg: applyState.msg }) :
    selected ? t('monitor.selectedPreset', { name: entryLabel(selected, t) }) :
    loading ? t('monitor.loading') :
    !hasAny ? t('monitor.noSavedLayouts') :
    t('monitor.noPresetSelected')
  const statusColor =
    applyState.kind === 'err' ? 'text-red-600 dark:text-red-400' :
    applyState.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' :
    applyState.kind === 'busy' ? 'text-sky-600 dark:text-sky-400' :
    'text-muted'

  // Resolve the displayed monitor AFTER all hooks (Rules of Hooks): fall back to
  // the first monitor if the selected id isn't in the live set (display unplugged
  // / stale id), and render nothing only when there are no monitors at all.
  const current = monitors.find((m) => m.id === currentMonitorId) ?? monitors[0]
  if (!current) return null
  const activeCount = monitors.filter((m) => m.active).length
  const roleLabel =
    current.role === 'Primary' ? t('monitor.primary')
    : current.role === 'Secondary' ? t('monitor.secondary')
    : current.role

  return (
    <aside className="h-full overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-sm">
      {/* ---------------------------------------------------- */}
      {/*  QUICK PRESETS                                       */}
      {/* ---------------------------------------------------- */}
      <div data-tour="quick-presets-section" className="mb-6">
        {/* Title row — Quick Presets label */}
        <div className="mb-2 flex items-center">
          <div className="text-[14px] font-semibold text-fg">{t('monitor.quickPresets')}</div>
        </div>

        {/* Action buttons row — proper buttons (not tertiary text links).
            'Manage QPs' is the primary entry point to compose / rename /
            delete Quick Preset bundles; gets a filled sky-blue pill.
            'Layouts ↗' is a secondary cross-link to the Layouts tab on
            the right pane; ghost-styled but still clearly clickable. */}
        {/* items-stretch + min-h-8 + leading-tight so a longer label (e.g.
            ES "Gestionar preajustes") wraps to two lines and grows the
            button instead of overflowing a fixed height. Both buttons keep
            equal height via items-stretch. */}
        <div className="mb-3 flex items-stretch gap-2">
          <button
            type="button"
            data-tour="qp-manage-button"
            onClick={() => setQpManagerOpen(true)}
            className="flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-center text-[12px] font-semibold leading-tight text-sky-700 shadow-sm hover:bg-sky-100 hover:border-sky-400 dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300 dark:hover:bg-primary/20 dark:hover:border-primary/60"
            title={t('monitor.manageQPsTitle')}
          >
            <span aria-hidden>⚡</span>
            {t('monitor.manageQPs')}
          </button>
          <button
            type="button"
            data-tour="qp-layouts-link"
            onClick={onOpenLayoutsTab}
            className="flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-[12px] font-medium text-fg shadow-sm hover:bg-line/60 hover:border-line-strong"
            title={t('monitor.layoutsLinkTitle')}
          >
            {t('monitor.layoutsLink')}
            <span aria-hidden className="text-muted">↗</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              data-tour="qp-dropdown"
              onClick={() => setOpen((v) => !v)}
              disabled={!loading && !hasAny}
              className="flex w-full items-center justify-between rounded-lg border border-line bg-raised px-3 py-2 text-sm shadow-sm hover:bg-line/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="truncate">
                {selected ? entryLabel(selected, t) : t('monitor.choosePreset')}
              </span>
              <span aria-hidden>▾</span>
            </button>

            {open && hasAny && (
              <div
                className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface p-1 shadow-lg ring-1 ring-line max-h-64 overflow-y-auto"
                role="menu"
              >
                {quickpresets && quickpresets.length > 0 && (
                  <>
                    <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {t('monitor.dropdownQuickPresets')}
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
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-line/60 text-fg"
                          role="menuitem"
                          title={q.path}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span aria-hidden className="text-purple-500">⚡</span>
                            <span className="truncate">{q.name}</span>
                          </span>
                          <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted">
                            {t('monitor.layoutCount', { count: q.layoutCount })}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}

                {layouts && layouts.length > 0 && (
                  <>
                    {quickpresets && quickpresets.length > 0 && (
                      <div className="my-1 h-px bg-line" />
                    )}
                    <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {t('monitor.dropdownLayouts')}
                    </div>
                    {layouts.map((p) => {
                      const e: DropdownEntry = { type: 'layout', layout: p }
                      return (
                        <button
                          key={entryKey(e)}
                          type="button"
                          onClick={() => handleChoose(e)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-line/60 text-fg"
                          role="menuitem"
                          title={p.path}
                        >
                          <span>{entryLabel(e, t)}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">
                            {t('monitor.slot', { slot: p.slot })}
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
            data-tour="qp-apply-button"
            onClick={onApply}
            disabled={!selected || isApplying}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            title={
              selected
                ? selected.type === 'qp'
                  ? `POST /quickpresets/run slot=${selected.slot}`
                  : `POST /presets/run kind=${selected.layout.kind} slot=${selected.layout.slot}`
                : t('monitor.pickPresetFirst')
            }
          >
            {isApplying ? '…' : `▶ ${t('monitor.apply')}`}
          </button>
        </div>

        {/* Switch mode. Sits directly under Apply because that is the button whose
            behaviour it changes — putting it in Settings would hide a destructive
            mode away from its own consequence. Default OFF; the label states which
            way round it currently is, so the state is never inferred from a colour
            alone. */}
        <label
          data-tour="qp-switch-mode"
          className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-raised px-2.5 py-2 shadow-sm hover:border-line-strong"
          title={t('monitor.switchModeTitle')}
        >
          <input
            type="checkbox"
            checked={switchMode}
            onChange={(e) => setSwitchMode(e.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold leading-tight text-fg">
              {t('monitor.switchMode')}
            </span>
            <span className={`block text-[10px] leading-tight ${switchMode ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
              {switchMode ? t('monitor.switchModeOn') : t('monitor.switchModeOff')}
            </span>
          </span>
        </label>

        <div className={`mt-2 text-[11px] ${statusColor}`}>{statusText}</div>

        {/* What the swap could NOT take down, named and explained. Ruling D-1.
            This persists until dismissed rather than flashing like the status
            line: "it worked" can afford to disappear, "something of yours is
            still open" cannot.

            Deliberately NOT a tour anchor. It exists only after a switch has left
            something open, so a walkthrough could never reach it on a healthy
            desktop — a step pointing here would find null and be unable to tell
            "not rendered yet" from "deleted", the exact ambiguity reachableWhen
            exists to prevent (finding F-4). */}
        {leftBehind.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                {t('monitor.switchLeftBehindTitle')} · {leftBehind.length}
              </span>
              <button
                type="button"
                onClick={() => { setLeftBehind([]); setDisagreements([]) }}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                {t('monitor.switchLeftBehindDismiss')}
              </button>
            </div>
            <ul className="space-y-1">
              {leftBehind.map((w) => (
                <li key={w.hwnd} className="text-[10px] leading-tight">
                  <span className="block truncate font-medium text-fg" title={w.title || undefined}>
                    {w.title || t('monitor.switchUnnamedWindow')}
                  </span>
                  {/* The reason comes from the agent, which is the only layer that
                      knows why. Inventing wording here would let the two drift. */}
                  <span className="block text-amber-700 dark:text-amber-400">{w.reason}</span>
                </li>
              ))}
            </ul>

            {disagreements.length > 0 && (
              <div className="mt-2 border-t border-amber-300 pt-1.5 dark:border-amber-500/40">
                <span className="block text-[10px] font-semibold text-red-700 dark:text-red-400">
                  {t('monitor.switchDisagreementTitle')}
                </span>
                <span className="block text-[10px] leading-tight text-red-700 dark:text-red-400">
                  {t('monitor.switchDisagreementBody', { count: disagreements.length })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/*  MONITOR SELECTION (UNCHANGED)                       */}
      {/* ---------------------------------------------------- */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-fg">{t('monitor.selection')}</div>

        <div className="mb-2">
          <select
            data-tour="monitor-select"
            value={currentMonitorId}
            onChange={(e) => setCurrentMonitor(e.target.value)}
            className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm shadow-sm"
          >
            {chipMonitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[12px] text-muted">
          {current.resolution} {roleLabel}
        </div>

        <div className="mt-3 rounded-xl border border-line bg-raised p-3 shadow-sm">
          <div className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2">
              <span className={`inline-block size-2 rounded-full ${current.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
              <span>{current.name}</span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                current.active
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
                  : 'bg-raised text-muted'
              }`}
            >
              {current.active ? t('monitor.active') : t('monitor.inactive')}
            </span>
          </div>

          <dl className="mt-3 space-y-1 text-[12px] text-muted">
            <div className="flex justify-between">
              <dt>{t('monitor.role')}</dt>
              <dd>{roleLabel}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('monitor.resolution')}</dt>
              <dd>{current.resolution}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-3 text-[11px] text-muted">
          {t('monitor.activeMonitors', { active: activeCount, total: monitors.length })}
        </div>

        <DisplayArray />

        {inTauri() && (
          <button
            type="button"
            data-tour="identify-monitors-button"
            onClick={() => { void api.identifyMonitors() }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-1.5 text-[12px] font-medium text-fg shadow-sm hover:bg-line/60 hover:border-line-strong"
            title={t('monitor.identifyMonitorsTitle')}
          >
            <span aria-hidden>🔢</span>
            {t('monitor.identifyMonitors')}
          </button>
        )}
      </div>

      {qpManagerOpen && (
        <QuickPresetsManager onClose={() => setQpManagerOpen(false)} />
      )}
    </aside>
  )
}

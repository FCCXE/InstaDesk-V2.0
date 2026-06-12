import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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

function entryLabel(e: DropdownEntry, t: TFunction): string {
  if (e.type === 'qp') return e.name
  return e.layout.kind === 'general'
    ? t('monitor.entryLayout', { slot: e.layout.slot })
    : t('monitor.entrySingle', { slot: e.layout.slot })
}

export default function MonitorSelector() {
  const { monitors, currentMonitorId, setCurrentMonitor, windowMargin } = useAppState()
  const { t } = useTranslation()

  const current = monitors.find((m) => m.id === currentMonitorId)!
  const activeCount = monitors.filter((m) => m.active).length
  const roleLabel =
    current.role === 'Primary' ? t('monitor.primary')
    : current.role === 'Secondary' ? t('monitor.secondary')
    : current.role

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
            msg: `${t('monitor.appliedName', { name: entryLabel(selected, t) })} • ${t('monitor.windows', { count: r.results.length })}`,
          })
        } else {
          flash({ kind: 'err', msg: t('monitor.layoutFailed', { failed: failures.length, total: r.results.length }) })
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

  return (
    <aside className="h-full overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-sm">
      {/* ---------------------------------------------------- */}
      {/*  QUICK PRESETS                                       */}
      {/* ---------------------------------------------------- */}
      <div className="mb-6">
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
            onClick={() => setQpManagerOpen(true)}
            className="flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1 text-center text-[12px] font-semibold leading-tight text-sky-700 shadow-sm hover:bg-sky-100 hover:border-sky-400 dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300 dark:hover:bg-primary/20 dark:hover:border-primary/60"
            title={t('monitor.manageQPsTitle')}
          >
            <span aria-hidden>⚡</span>
            {t('monitor.manageQPs')}
          </button>
          <button
            type="button"
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

        <div className={`mt-2 text-[11px] ${statusColor}`}>{statusText}</div>
      </div>

      {/* ---------------------------------------------------- */}
      {/*  MONITOR SELECTION (UNCHANGED)                       */}
      {/* ---------------------------------------------------- */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-fg">{t('monitor.selection')}</div>

        <div className="mb-2">
          <select
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
      </div>

      {qpManagerOpen && (
        <QuickPresetsManager onClose={() => setQpManagerOpen(false)} />
      )}
    </aside>
  )
}

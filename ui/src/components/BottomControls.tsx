import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState, GRID_SIZE_PRESETS, type GridSize } from '../state/AppState'
import { api } from '../services/api'
import { useConfirm } from './common/ConfirmDialog'

/**
 * Bottom controls strip.
 *
 * Real product flows live elsewhere:
 *   - Launch / save layout / run layout: Layouts tab on the right pane,
 *     plus the Quick Presets dropdown on the left pane.
 *   - Multi-tab browser launches: Apps → URLs sub-tab → Save → assign
 *     in Apps → Apps sub-tab.
 *
 * Snap = Divvy-style ad-hoc snap. Calls /snap/popup which spawns the
 * native WinAgent overlay on the currently-selected monitor. User
 * drags a rectangle in the popup, last-focused non-InstaDesk window
 * snaps into it.
 *
 * "Clear All" clears the CURRENT monitor's assigned cells AND resets that
 * monitor's grid size to the global Settings default (operator decision
 * 2026-06-09: α + i). Other monitors are not affected. The size reset
 * removes the per-monitor override entirely so the monitor follows future
 * changes to the global default going forward.
 */

type SnapState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; msg: string }
  | { kind: 'warn'; msg: string }
  | { kind: 'cancelled' }
  | { kind: 'err'; msg: string }

export default function BottomControls() {
  const {
    selection, assignments, clearGrid, clearAllGrids, assignmentsByMonitor,
    currentMonitorId,
    currentGridCols, currentGridRows, resizeMonitor,
    setGridSizeForMonitor, editingLayoutId,
    windowMargin,
  } = useAppState()

  const { t } = useTranslation()
  const confirm = useConfirm()
  const assignedCount = Object.values(assignments).filter(Boolean).length
  // Total assignments across ALL monitors — drives the "Clear All Grids"
  // enabled state so it's dimmed when there's nothing anywhere to clear.
  const totalAssignedCount = Object.values(assignmentsByMonitor)
    .reduce((sum, cells) => sum + Object.values(cells).filter(Boolean).length, 0)
  const selCount = selection.size

  // Agent expects 1-based monitor indices; AppState uses "m{N}" ids.
  const currentMonitorIndex = useMemo(() => {
    const m = currentMonitorId.match(/^m(\d+)$/)
    return m ? parseInt(m[1], 10) : 1
  }, [currentMonitorId])

  // Bottom-bar grid-size picker for the active monitor (Step 2 of the
  // 4-step grid-size build). Confirms before wiping cells / exiting Edit
  // mode; reassures the user that saved Layouts and QPs are untouched.
  const onGridSizeChange = (next: GridSize) => {
    if (next.cols === currentGridCols && next.rows === currentGridRows) return

    const monitorLabel = `M${currentMonitorIndex}`
    const fromLabel = `${currentGridCols}×${currentGridRows}`
    const toLabel = `${next.cols}×${next.rows}`

    if (assignedCount === 0 && !editingLayoutId) {
      // Empty grid, not editing — apply silently. resizeMonitor handles
      // the clear (no-op) and the state write atomically.
      setGridSizeForMonitor(currentMonitorId, next)
      return
    }

    const parts: string[] = []
    parts.push(t('bottomBar.confirmSwitch', { monitor: monitorLabel, from: fromLabel, to: toLabel }))
    if (assignedCount > 0) {
      parts.push(t('bottomBar.confirmWillClear', { count: assignedCount, monitor: monitorLabel }))
    }
    if (editingLayoutId) {
      parts.push(t('bottomBar.confirmExitEdit'))
    }
    parts.push(`\n\n${t('bottomBar.confirmUnaffected')}`)
    parts.push(`\n\n${t('bottomBar.confirmContinue')}`)

    if (window.confirm(parts.join(' ').replace(' \n', '\n'))) {
      resizeMonitor(currentMonitorId, next)
    }
  }

  const [snapState, setSnapState] = useState<SnapState>({ kind: 'idle' })
  const snapping = snapState.kind === 'busy'

  const onSnap = async () => {
    setSnapState({ kind: 'busy' })
    try {
      // Snap popup uses the active monitor's per-monitor grid size
      // (Step 4 of the grid-size build, 2026-06-09). Also passes the
      // user-configured window margin (bezel-aware feature) so the popup
      // overlay grid AND the final snapped window honor the same edge
      // padding the operator set in Settings.
      const gridSize = `${currentGridCols}x${currentGridRows}`
      const res = await api.snapPopup(currentMonitorIndex, gridSize, windowMargin)
      const r = res.result
      if (r?.cancelled) {
        setSnapState({ kind: 'cancelled' })
        window.setTimeout(() => setSnapState({ kind: 'idle' }), 3000)
        return
      }
      if (r?.ok && r.snapped) {
        const s = r.snapped
        // placementVerified=false means the agent positioned the window
        // but the app moved itself back (Hikvision iVMS-4200 et al.).
        // Surface as warn (amber) so the operator knows the snap didn't
        // actually take effect even though the request itself succeeded.
        if (r.placementVerified === false) {
          setSnapState({
            kind: 'warn',
            msg: t('bottomBar.rejected', { title: r.targetTitle ?? '?' }),
          })
          window.setTimeout(() => setSnapState({ kind: 'idle' }), 7000)
          return
        }
        setSnapState({
          kind: 'ok',
          msg: t('bottomBar.snapped', {
            title: r.targetTitle ?? '?',
            monitor: r.monitor ?? currentMonitorIndex,
            geom: `${s.x},${s.y},${s.w}×${s.h}`,
          }),
        })
        window.setTimeout(() => setSnapState({ kind: 'idle' }), 4000)
        return
      }
      setSnapState({ kind: 'err', msg: r?.error ?? `Exit code ${res.exitCode}` })
    } catch (e) {
      setSnapState({ kind: 'err', msg: (e as Error).message })
    }
  }

  const idleStatus =
    assignedCount === 0 && selCount === 0 ? t('bottomBar.ready') :
    selCount > 0
      ? t('bottomBar.cellsSelected', { count: selCount }) +
        (assignedCount > 0 ? t('bottomBar.alsoAssigned', { count: assignedCount }) : '')
      : t('bottomBar.cellsAssigned', { count: assignedCount })

  const statusText =
    snapState.kind === 'busy' ? t('bottomBar.pickRegion') :
    snapState.kind === 'ok' ? snapState.msg :
    snapState.kind === 'warn' ? snapState.msg :
    snapState.kind === 'cancelled' ? t('bottomBar.snapCancelled') :
    snapState.kind === 'err' ? t('bottomBar.snapError', { msg: snapState.msg }) :
    idleStatus

  const statusColor =
    snapState.kind === 'err' ? 'text-red-600 dark:text-red-400' :
    snapState.kind === 'warn' ? 'text-amber-700 font-medium dark:text-amber-300' :
    snapState.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' :
    snapState.kind === 'cancelled' ? 'text-amber-600 dark:text-amber-300' :
    snapState.kind === 'busy' ? 'text-sky-600 dark:text-sky-400' :
    'text-muted'

  return (
    <div className="mt-4 h-12 border-t border-line bg-surface grid grid-cols-[284px_1fr_320px] gap-3 items-center">
      {/* Left column (under the left pane) — kept empty so the controls
          center under the CENTER grid column, not the whole bar. The
          column template mirrors App.tsx's dashboard grid exactly, so the
          buttons land precisely under the main grid (whose center sits
          ~18px left of the bar midpoint because the left pane is narrower
          than the right). */}
      <div />

      {/* Center column — Snap / Clear All / Grid, centered under the grid. */}
      <div className="flex items-center justify-center gap-2">
        {/* Snap moves first — it's the most-used utility action and the
            operator wanted it at the head of the row for muscle memory. */}
        <button
          type="button"
          onClick={onSnap}
          disabled={snapping}
          className={[
            'px-3 py-1.5 rounded-lg text-sm font-semibold border shadow-sm transition-colors',
            // Snap is the accent action: violet in light, electric-cyan
            // with a soft glow in dark (per the dark mockup).
            snapping
              ? 'border-violet-200 bg-violet-100 text-violet-500 cursor-wait dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-400/60'
              : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-400 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-300 dark:shadow-[0_0_12px_rgba(34,211,238,0.25)] dark:hover:bg-cyan-400/20 dark:hover:border-cyan-300',
          ].join(' ')}
          title={t('bottomBar.snapTitle', { monitor: currentMonitorIndex })}
        >
          📌 {snapping ? t('bottomBar.snapping') : t('bottomBar.snap', { monitor: `M${currentMonitorIndex}` })}
        </button>
        <button
          type="button"
          onClick={clearGrid}
          disabled={assignedCount === 0}
          className="px-3 py-1.5 rounded-lg border border-line bg-raised text-sm text-fg hover:bg-line/60 disabled:cursor-not-allowed disabled:opacity-60"
          title={assignedCount > 0
            ? t('bottomBar.clearCurrentTitle', { count: assignedCount, monitor: currentMonitorIndex })
            : t('bottomBar.clearCurrentNothing')}
        >
          {t('bottomBar.clearCurrent')}
        </button>
        {/* Clear All Grids — wipes every monitor's grid. Destructive across
            monitors, so it's gated behind a confirm. (Native confirm for now;
            the app-wide styled-dialog sweep replaces all of these together.) */}
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: t('bottomBar.clearAllGridsConfirmTitle'),
              body: t('bottomBar.clearAllGridsConfirmBody'),
              confirmLabel: t('bottomBar.clearAllGrids'),
              danger: true,
            })
            if (ok) clearAllGrids()
          }}
          disabled={totalAssignedCount === 0}
          className="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-sm text-red-700 hover:bg-red-100 hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:border-red-400/60"
          title={totalAssignedCount > 0
            ? t('bottomBar.clearAllGridsTitle', { count: totalAssignedCount })
            : t('bottomBar.clearAllGridsNothing')}
        >
          {t('bottomBar.clearAllGrids')}
        </button>
        {/* Per-monitor grid-size picker — operator decision δ (2026-06-09):
            sits in the bottom bar grouped with Snap and Clear All, both of
            which are also scoped to the current monitor. Label format
            "Grid: NxN ▾" is informative on first sight. */}
        <label className="flex items-center gap-1.5 text-sm text-fg">
          <span className="text-xs text-muted">{t('bottomBar.grid')}</span>
          <select
            value={`${currentGridCols}x${currentGridRows}`}
            onChange={(e) => {
              const [c, r] = e.target.value.split('x').map((n) => parseInt(n, 10))
              if (Number.isFinite(c) && Number.isFinite(r)) {
                onGridSizeChange({ cols: c, rows: r })
              }
            }}
            className="rounded-lg border border-line bg-raised px-2 py-1.5 text-sm text-fg hover:bg-line/60 focus:outline-none focus:ring-2 focus:ring-ring"
            title={t('bottomBar.gridSelectTitle', { monitor: currentMonitorIndex })}
          >
            {GRID_SIZE_PRESETS.map((s) => (
              <option key={`${s.cols}x${s.rows}`} value={`${s.cols}x${s.rows}`}>
                {s.cols}×{s.rows}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* Right column (under the right pane) — status, right-aligned.
          Truncates long transient snap messages (full text on hover). */}
      <div className="flex min-w-0 items-center justify-end">
        <span className={`truncate text-xs ${statusColor}`} title={statusText}>
          {statusText} <span className="ml-2 text-muted">• 1280×820</span>
        </span>
      </div>
    </div>
  )
}

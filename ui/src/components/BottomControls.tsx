import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppState, GRID_SIZE_PRESETS, type GridSize } from '../state/AppState'
import { api, inTauri } from '../services/api'
import { track } from '../services/telemetry'
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

  // editingLayoutId is `${kind}_${slot}` — a filename stem, never something to
  // show a user. The saved NAME is not reachable from here: AppState.presets is
  // the demo list, not the saved Layouts, and the real ones are fetched inside
  // LayoutsPane. So show the slot, which the id genuinely carries. Reaching for a
  // name we do not have would mean inventing a lookup that is wrong.
  const editingLayoutName = editingLayoutId
    ? t('monitor.entryLayout', { slot: editingLayoutId.split('_').pop() ?? '' })
    : ''
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
  const onGridSizeChange = async (next: GridSize) => {
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

    if (await confirm({ title: t('bottomBar.gridResizeTitle'), body: parts.join(' ').replace(' \n', '\n') })) {
      resizeMonitor(currentMonitorId, next)
    }
  }

  const [snapState, setSnapState] = useState<SnapState>({ kind: 'idle' })
  const snapping = snapState.kind === 'busy'

  // "Show desktop" toggle: first click minimizes every window, the button then
  // flips to restore them — each back to the exact frame (grid region) it was in,
  // not a full-screen maximize. Local boolean is enough — if the user moves
  // windows manually it just re-toggles next click.
  const [minimized, setMinimized] = useState(false)
  const [arrangeBusy, setArrangeBusy] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)

  const onArrangeAll = async () => {
    if (arrangeBusy) return
    const action = minimized ? 'restore' : 'minimize'
    setArrangeBusy(true)
    try {
      const r = await api.arrangeAllWindows(action)
      if (r.ok) {
        setMinimized(action === 'minimize')
        track('arrange_all_windows', { action })
        const base =
          action === 'minimize'
            ? t('bottomBar.minimizedAll', { count: r.affected })
            : t('bottomBar.restoredAll', { count: r.affected })
        const skip = r.skippedElevated > 0 ? t('bottomBar.skippedElevated', { count: r.skippedElevated }) : ''
        setSnapState({ kind: 'ok', msg: base + skip })
        window.setTimeout(() => setSnapState({ kind: 'idle' }), 4000)
      } else {
        setSnapState({ kind: 'err', msg: r.error ?? 'failed' })
      }
    } catch (e) {
      setSnapState({ kind: 'err', msg: (e as Error).message })
    } finally {
      setArrangeBusy(false)
    }
  }

  // Close all windows — the one-click "clear my desktop". Destructive, so it's
  // gated behind a red confirm. The agent sends each window a graceful WM_CLOSE
  // (apps with unsaved work show their own save prompt); InstaDesk and elevated
  // apps are excluded/skipped. Result is surfaced in the shared status line.
  const onCloseAll = async () => {
    if (closeBusy) return
    const ok = await confirm({
      title: t('bottomBar.closeAllConfirmTitle'),
      body: t('bottomBar.closeAllConfirmBody'),
      confirmLabel: t('bottomBar.closeAll'),
      danger: true,
    })
    if (!ok) return
    setCloseBusy(true)
    try {
      const r = await api.closeAllWindows()
      if (r.ok) {
        track('close_all_windows', { affected: r.affected })
        const base = t('bottomBar.closedAll', { count: r.affected })
        const skip = r.skippedElevated > 0 ? t('bottomBar.skippedElevated', { count: r.skippedElevated }) : ''
        setSnapState({ kind: 'ok', msg: base + skip })
        window.setTimeout(() => setSnapState({ kind: 'idle' }), 5000)
      } else {
        setSnapState({ kind: 'err', msg: r.error ?? 'failed' })
      }
    } catch (e) {
      setSnapState({ kind: 'err', msg: (e as Error).message })
    } finally {
      setCloseBusy(false)
    }
  }

  const onSnap = async () => {
    if (snapping) return // guard re-entry (button is disabled, but the hotkey isn't)
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
        track('snap_used', { gridSize })
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

  // Run the same Snap from the global hotkey (Ctrl+Alt+S). A ref keeps the
  // listener pointed at the latest onSnap (current monitor/grid) without
  // re-subscribing on every render.
  const onSnapRef = useRef(onSnap)
  onSnapRef.current = onSnap
  useEffect(() => {
    if (!inTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen('insta://hotkey/snap', () => { onSnapRef.current() }))
      .then((u) => { unlisten = u })
      .catch(() => {})
    return () => { unlisten?.() }
  }, [])

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
    <div className="mt-4">
      {/* DEFECT B (2026-08-26). The Save control lives in LayoutsPane, which
          RightPane mounts ONLY on the Layouts tab — while the editing itself
          happens in the grid and the Apps tab. Nothing was broken: the editing
          state survives the tab change and the amber banner does overwrite in one
          click. It was simply unfindable, and to the user that is the same thing.
          The bottom bar is always mounted and already reads editingLayoutId, so
          it can say what is going on from anywhere.
          The save itself deliberately stays where it is: firing it from here would
          mean invoking logic in an unmounted component. This points at it. */}
      {editingLayoutId && (
        <div className="flex items-center gap-2 border-t border-amber-300 bg-amber-50 px-3 py-1.5 dark:border-amber-500/40 dark:bg-amber-500/10">
          <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            {t('bottomBar.editingLayout', { name: editingLayoutName })}
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-amber-800 dark:text-amber-300">
            {t('bottomBar.editingHint')}
          </span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('insta:open-layouts-tab'))}
            className="shrink-0 rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-200 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-200"
          >
            {t('bottomBar.editingGoSave')}
          </button>
        </div>
      )}
    <div data-tour="bottom-bar" className="min-h-12 border-t border-line bg-surface flex flex-wrap items-center gap-2 px-3 py-1">
      {/* Bottom-bar strip (2026-07-27): three zones — a fixed LEFT spacer, the
          flex-1 CENTER that holds the button group (justify-center), and a fixed
          RIGHT status zone. The group centers within the flex-1 middle; because
          the left spacer is NARROWER than the right status zone, that middle is
          biased left, so the group sits a touch left of the bar's raw center —
          optically balancing the right-hand "Ready" so it reads as centered.
          Shift = (rightZone − leftSpacer) / 2 ≈ (176 − 112) / 2 ≈ 32px; make the
          LEFT spacer smaller to shift further left, larger to shift right. Both
          zones are FIXED widths, so the centered group never moves as transient
          snap messages come and go. Supersedes the earlier 3-column grid that
          crammed every control into the center third (decision δ 2026-06-09). */}
      {/* Left spacer — narrower than the right status zone (see above). */}
      <div className="w-28 shrink-0" />
      <div className="flex-1 flex items-center justify-center gap-2">
        {/* Snap moves first — it's the most-used utility action and the
            operator wanted it at the head of the row for muscle memory. */}
        <button
          type="button"
          data-tour="snap-button"
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
        {/* Minimize-all / Maximize-all toggle — the reliable "Show desktop"
            replacement. First click hides every window; the button flips to
            maximize them (each on its own monitor). Elevated apps are skipped. */}
        <button
          type="button"
          data-tour="minimize-all-button"
          onClick={onArrangeAll}
          disabled={arrangeBusy}
          className="px-3 py-1.5 rounded-lg border border-line bg-raised text-sm text-fg hover:bg-line/60 disabled:cursor-not-allowed disabled:opacity-60"
          title={t(minimized ? 'bottomBar.restoreAllTitle' : 'bottomBar.minimizeAllTitle')}
        >
          {arrangeBusy
            ? t('bottomBar.arranging')
            : minimized
              ? `🗖 ${t('bottomBar.restoreAll')}`
              : `🗕 ${t('bottomBar.minimizeAll')}`}
        </button>
        <button
          type="button"
          data-tour="clear-current-button"
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
          data-tour="clear-all-grids-button"
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
            data-tour="grid-size-picker"
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
        {/* Close all windows — one-click "clear my desktop", placed to the RIGHT
            of the Grid picker (operator request 2026-07-27). Destructive (closes
            every open window), so it's gated behind a red confirm; the agent
            sends a graceful WM_CLOSE so apps with unsaved work still prompt to
            save. Red styling signals the destruction, matching Clear All Grids. */}
        <button
          type="button"
          data-tour="close-all-button"
          onClick={onCloseAll}
          disabled={closeBusy}
          className="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-sm font-medium text-red-700 hover:bg-red-100 hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:border-red-400/60"
          title={t('bottomBar.closeAllTitle')}
        >
          {closeBusy ? t('bottomBar.closingAll') : `✕ ${t('bottomBar.closeAll')}`}
        </button>
      </div>
      {/* Status — FIXED-width right zone (w-44), right-aligned; long transient
          snap messages truncate (full text on hover). Its fixed width is what
          holds the button group's center stable regardless of the message. */}
      <div data-tour="bottom-status" className="w-44 shrink-0 flex min-w-0 items-center justify-end">
        <span className={`truncate text-xs ${statusColor}`} title={statusText}>
          {statusText}
        </span>
      </div>
    </div>
    </div>
  )
}

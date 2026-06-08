import { useMemo, useState } from 'react'
import { useAppState } from '../state/AppState'
import { api } from '../services/api'

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
 * "Clear All" is wired to clearGrid(); the remaining placeholders
 * (Copy Grid, Fill Grid, Spacing) are reserved for future actions.
 */

type SnapState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; msg: string }
  | { kind: 'warn'; msg: string }
  | { kind: 'cancelled' }
  | { kind: 'err'; msg: string }

export default function BottomControls() {
  const { selection, assignments, clearGrid, currentMonitorId } = useAppState()

  const assignedCount = Object.values(assignments).filter(Boolean).length
  const selCount = selection.size

  // Agent expects 1-based monitor indices; AppState uses "m{N}" ids.
  const currentMonitorIndex = useMemo(() => {
    const m = currentMonitorId.match(/^m(\d+)$/)
    return m ? parseInt(m[1], 10) : 1
  }, [currentMonitorId])

  const [snapState, setSnapState] = useState<SnapState>({ kind: 'idle' })
  const snapping = snapState.kind === 'busy'

  const onSnap = async () => {
    setSnapState({ kind: 'busy' })
    try {
      const res = await api.snapPopup(currentMonitorIndex, '6x6')
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
            msg: `"${r.targetTitle ?? '?'}" rejected snap — app enforces own placement. Try closing and relaunching it first.`,
          })
          window.setTimeout(() => setSnapState({ kind: 'idle' }), 7000)
          return
        }
        setSnapState({
          kind: 'ok',
          msg: `Snapped "${r.targetTitle ?? '?'}" → M${r.monitor ?? currentMonitorIndex} ${s.x},${s.y},${s.w}×${s.h}`,
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
    assignedCount === 0 && selCount === 0 ? 'Ready' :
    selCount > 0 ? `${selCount} cell${selCount === 1 ? '' : 's'} selected${assignedCount > 0 ? `, ${assignedCount} assigned` : ''}` :
    `${assignedCount} cell${assignedCount === 1 ? '' : 's'} assigned`

  const statusText =
    snapState.kind === 'busy' ? 'Pick a region in the popup window…' :
    snapState.kind === 'ok' ? snapState.msg :
    snapState.kind === 'warn' ? `⚠ ${snapState.msg}` :
    snapState.kind === 'cancelled' ? 'Snap cancelled' :
    snapState.kind === 'err' ? `Snap error: ${snapState.msg}` :
    idleStatus

  const statusColor =
    snapState.kind === 'err' ? 'text-red-600' :
    snapState.kind === 'warn' ? 'text-amber-700 font-medium' :
    snapState.kind === 'ok' ? 'text-emerald-600' :
    snapState.kind === 'cancelled' ? 'text-amber-600' :
    snapState.kind === 'busy' ? 'text-sky-600' :
    'text-gray-500'

  return (
    <div className="mt-4 h-12 border-t border-gray-200 bg-white px-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clearGrid}
          disabled={assignedCount === 0}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          title={assignedCount > 0 ? `Clear all ${assignedCount} assigned cells` : 'Nothing to clear'}
        >
          Clear All
        </button>
        {['Copy Grid', 'Fill Grid'].map((label) => (
          <button
            key={label}
            type="button"
            disabled
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400 cursor-not-allowed"
            title="Reserved for a future grid-utility action"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onSnap}
          disabled={snapping}
          className={[
            'px-3 py-1.5 rounded-lg text-sm font-semibold border shadow-sm transition-colors',
            snapping
              ? 'border-violet-200 bg-violet-100 text-violet-500 cursor-wait'
              : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:border-violet-400',
          ].join(' ')}
          title={`Divvy-style snap — opens a grid popup on M${currentMonitorIndex} and snaps the last-focused window into the selected region.`}
        >
          📌 {snapping ? 'Snapping…' : `Snap → M${currentMonitorIndex}`}
        </button>
        <button
          type="button"
          disabled
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400 cursor-not-allowed"
          title="Reserved for a future grid-utility action"
        >
          Spacing
        </button>
      </div>
      <div className={`text-xs ${statusColor}`}>
        {statusText} <span className="ml-2 text-gray-400">• 1280×820</span>
      </div>
    </div>
  )
}

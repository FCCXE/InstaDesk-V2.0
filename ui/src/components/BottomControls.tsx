import { useAppState } from '../state/AppState'

/**
 * Bottom controls strip.
 *
 * Real product flows now live elsewhere:
 *   - Launch / save layout / run layout: Layouts tab on the right pane,
 *     plus the Quick Presets dropdown on the left pane.
 *   - Multi-tab browser launches: Apps → URLs sub-tab → Save → assign
 *     in Apps → Apps sub-tab.
 *
 * The provisional debug buttons (🚀 Launch / 💾 Save A / ▶ Run A / 🗑) that
 * proved out the API client during development were removed in step 6.
 *
 * "Clear All" is wired to clearGrid(); the remaining placeholders (Copy Grid,
 * Fill Grid, Snap, Spacing) are reserved for future grid-utility actions.
 */
export default function BottomControls() {
  const { selection, assignments, clearGrid } = useAppState()

  const assignedCount = Object.values(assignments).filter(Boolean).length
  const selCount = selection.size

  const statusText =
    assignedCount === 0 && selCount === 0 ? 'Ready' :
    selCount > 0 ? `${selCount} cell${selCount === 1 ? '' : 's'} selected${assignedCount > 0 ? `, ${assignedCount} assigned` : ''}` :
    `${assignedCount} cell${assignedCount === 1 ? '' : 's'} assigned`

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
        {['Copy Grid', 'Fill Grid', 'Snap', 'Spacing'].map((label) => (
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
      </div>
      <div className="text-xs text-gray-500">
        {statusText} <span className="ml-2 text-gray-400">• 1280×820</span>
      </div>
    </div>
  )
}

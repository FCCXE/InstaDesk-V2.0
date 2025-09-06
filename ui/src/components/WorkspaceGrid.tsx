import { useMemo } from 'react'
import {
  useAppState,
  cellKey,
  GRID_ROWS,
  GRID_COLS,
  APPS,
} from '../state/AppState'

// Build a static GRID_ROWS × GRID_COLS grid
type Cell = { r: number; c: number }
const cells: Cell[] = Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => ({
  r: Math.floor(i / GRID_COLS),
  c: i % GRID_COLS,
}))

export default function WorkspaceGrid() {
  const {
    selection,
    assignments,
    beginDrag,
    updateDrag,
    endDrag,
  } = useAppState()

  // Mouse handlers
  const onCellMouseDown = (r: number, c: number) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    beginDrag(r, c, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey })
  }
  const onCellMouseEnter = (r: number, c: number) => () => {
    updateDrag(r, c)
  }

  const status = useMemo(() => {
    if (selection.size === 0) return 'No selection'
    let rMin = Infinity, rMax = -Infinity, cMin = Infinity, cMax = -Infinity
    selection.forEach((k) => {
      const [r, c] = k.split('-').map(Number)
      rMin = Math.min(rMin, r); rMax = Math.max(rMax, r)
      cMin = Math.min(cMin, c); cMax = Math.max(cMax, c)
    })
    const count = selection.size
    return `Selected: ${rMin}–${rMax} × ${cMin}–${cMax} • ${count} cell${count === 1 ? '' : 's'}`
  }, [selection])

  const isHighlighted = (r: number, c: number) => selection.has(cellKey(r, c))

  return (
    <section
      className="h-full w-full bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col"
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="w-full h-full max-w-full max-h-full aspect-square">
          <div className="relative w-full h-full select-none">
            {/* Grid */}
            <div
              className="grid w-full h-full gap-[3px]"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
              }}
            >
              {cells.map(({ r, c }) => {
                const highlighted = isHighlighted(r, c)
                const key = cellKey(r, c)
                const appId = assignments[key]
                const app = appId ? APPS[appId] : null

                return (
                  <div
                    key={key}
                    onMouseDown={onCellMouseDown(r, c)}
                    onMouseEnter={onCellMouseEnter(r, c)}
                    title={app ? app.name : ''}
                    className="relative border rounded transition-colors"
                    style={{
                      backgroundColor: highlighted ? 'rgba(59,130,246,0.18)' : '#ffffff',
                      borderColor: highlighted ? '#93c5fd' : '#e5e7eb',
                      cursor: 'crosshair',
                    }}
                  >
                    {/* Assignment hint (subtle, matches UI) */}
                    {app && (
                      <div className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 text-[10px] text-gray-600">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: app.color || '#9ca3af' }}
                        />
                        <span className="font-medium leading-none">
                          {app.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500">{status}</div>
    </section>
  )
}

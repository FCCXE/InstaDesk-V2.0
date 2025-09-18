import React, { useEffect, useMemo, useRef } from 'react'
import {
  useAppState,   // central store
  cellKey,
  GRID_ROWS,
  GRID_COLS,
} from '../state/AppState'

// Build a static GRID_ROWS × GRID_COLS grid
type Cell = { r: number; c: number }
const cells: Cell[] = Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => ({
  r: Math.floor(i / GRID_COLS),
  c: i % GRID_COLS,
}))

export default function WorkspaceGrid() {
  // Keep your proven “cell mouse handlers + window mouseup” UX
  const draggingRef = useRef(false)

  // From AppState
  const {
    selection,            // Set<"r,c">
    beginDrag,            // (r, c) => void
    updateDrag,           // (r, c) => void
    endDrag,              // () => void
    clearSelection,       // () => void
  } = useAppState()

  // Broadcast selection size to the RightPane (Apps) on every change
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('insta:selection', {
        detail: { count: selection.size },
      })
    )
  }, [selection])

  // ESC clears via provider
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        draggingRef.current = false
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])

  // Window mouseup stamps the selection in provider
  useEffect(() => {
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      endDrag()
    }
    window.addEventListener('mouseup', onUp, true)
    return () => window.removeEventListener('mouseup', onUp, true)
  }, [endDrag])

  // Handlers bound to each cell
  const onCellMouseDown = (r: number, c: number) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    draggingRef.current = true
    beginDrag(r, c)
    e.preventDefault()
    e.stopPropagation()
  }

  const onCellMouseEnter = (r: number, c: number) => () => {
    if (!draggingRef.current) return
    updateDrag(r, c)
  }

  // Status line from central Set<CellKey>
  const status = useMemo(() => {
    if (selection.size === 0) return 'No selection'
    let rMin = Infinity, rMax = -Infinity, cMin = Infinity, cMax = -Infinity
    selection.forEach((k) => {
      const [rs, cs] = k.split(',')
      const r = parseInt(rs, 10), c = parseInt(cs, 10)
      if (r < rMin) rMin = r
      if (r > rMax) rMax = r
      if (c < cMin) cMin = c
      if (c > cMax) cMax = c
    })
    const count = selection.size
    // Inclusive end bounds for readability: show 0–3 × 0–3 (not 0–2 × 0–2) for a 3×3 block
    return `Selected: ${rMin}–${rMax + 1} × ${cMin}–${cMax + 1} • ${count} cell${count === 1 ? '' : 's'}`
  }, [selection])

  const isHighlighted = (r: number, c: number) => selection.has(cellKey(r, c))

  return (
    <section className="h-full w-full bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col">
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
                return (
                  <div
                    key={`${r}-${c}`}
                    onMouseDown={onCellMouseDown(r, c)}
                    onMouseEnter={onCellMouseEnter(r, c)}
                    className="border rounded transition-colors"
                    style={{
                      backgroundColor: highlighted ? 'rgba(59,130,246,0.18)' : '#ffffff',
                      borderColor: highlighted ? '#93c5fd' : '#e5e7eb',
                      cursor: 'crosshair',
                    }}
                  />
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

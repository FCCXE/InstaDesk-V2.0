// Phase 0 data model stubs (kept for scaffold compatibility)
export type Cell = { r: number; c: number; appId?: string }
export type Grid = Cell[]

import { useEffect, useMemo, useRef, useState } from 'react'

const ROWS = 6
const COLS = 6

type RC = { r: number; c: number }

const cells: Grid = Array.from({ length: ROWS * COLS }, (_, i) => ({
  r: Math.floor(i / COLS),
  c: i % COLS,
}))

const key = (r: number, c: number) => `${r},${c}`

function rectKeys(a: RC, b: RC) {
  const r0 = Math.min(a.r, b.r)
  const r1 = Math.max(a.r, b.r)
  const c0 = Math.min(a.c, b.c)
  const c1 = Math.max(a.c, b.c)
  const out: string[] = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) out.push(key(r, c))
  }
  return { r0, r1, c0, c1, keys: out }
}

export default function WorkspaceGrid() {
  // selection is the stamped (persistent) rectangle
  const [selectionKeys, setSelectionKeys] = useState<Set<string>>(new Set())
  const [dragPreview, setDragPreview] = useState<Set<string> | null>(null)

  const draggingRef = useRef(false)
  const anchorRef = useRef<RC | null>(null)

  const hasSelection = selectionKeys.size > 0

  // ESC clears (works anywhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        draggingRef.current = false
        anchorRef.current = null
        setDragPreview(null)
        setSelectionKeys(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Window mouseup to stamp selection even if the cursor leaves the grid
  useEffect(() => {
    const up = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      anchorRef.current = null
      // Stamp the preview into the real selection
      setSelectionKeys((prev) => {
        const next = new Set(prev)
        if (dragPreview) {
          next.clear()
          dragPreview.forEach((k) => next.add(k))
        }
        return next
      })
      setDragPreview(null)
    }
    window.addEventListener('mouseup', up, true)
    return () => window.removeEventListener('mouseup', up, true)
  }, [dragPreview])

  // Derived: status text
  const status = useMemo(() => {
    if (!hasSelection) return 'No selection'
    let rMin = Infinity, rMax = -Infinity, cMin = Infinity, cMax = -Infinity
    selectionKeys.forEach((k) => {
      const [rs, cs] = k.split(',')
      const r = parseInt(rs, 10), c = parseInt(cs, 10)
      if (r < rMin) rMin = r
      if (r > rMax) rMax = r
      if (c < cMin) cMin = c
      if (c > cMax) cMax = c
    })
    const count = selectionKeys.size
    return `Selected: ${rMin}–${rMax} × ${cMin}–${cMax} • ${count} cell${count === 1 ? '' : 's'}`
  }, [hasSelection, selectionKeys])

  // Handlers on each CELL (no overlay, no pointer-capture)
  const onCellMouseDown = (rc: RC) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    draggingRef.current = true
    anchorRef.current = rc
    const { keys } = rectKeys(rc, rc)
    setDragPreview(new Set(keys))
    e.preventDefault()
    e.stopPropagation()
  }

  const onCellMouseEnter = (rc: RC) => () => {
    if (!draggingRef.current || !anchorRef.current) return
    const { keys } = rectKeys(anchorRef.current, rc)
    setDragPreview(new Set(keys))
  }

  // A cell is visually selected if it’s in the stamped selection OR in the live preview
  const isHighlighted = (r: number, c: number) => {
    const k = key(r, c)
    if (dragPreview && dragPreview.has(k)) return true
    return selectionKeys.has(k)
  }

  return (
    <section className="h-full w-full bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col">
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="w-full h-full max-w-full max-h-full aspect-square">
          <div className="relative w-full h-full select-none">
            {/* 6×6 Grid */}
            <div className="grid grid-cols-6 grid-rows-6 w-full h-full gap-[3px]">
              {cells.map((cell) => {
                const highlighted = isHighlighted(cell.r, cell.c)
                return (
                  <div
                    key={`${cell.r}-${cell.c}`}
                    onMouseDown={onCellMouseDown({ r: cell.r, c: cell.c })}
                    onMouseEnter={onCellMouseEnter({ r: cell.r, c: cell.c })}
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

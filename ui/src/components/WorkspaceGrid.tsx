import React, { useEffect, useRef, useState } from 'react'

// Phase 0 data model stubs
export type Cell = { r: number; c: number; appId?: string }
export type Grid = Cell[]

type CellIndex = { r: number; c: number }
type Range = { r0: number; c0: number; r1: number; c1: number }

const cells: Grid = Array.from({ length: 6 * 6 }, (_, i) => ({
  r: Math.floor(i / 6),
  c: i % 6,
}))

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export default function WorkspaceGrid() {
  const cardRef = useRef<HTMLElement | null>(null)
  const squareRef = useRef<HTMLDivElement | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [startCell, setStartCell] = useState<CellIndex | null>(null)
  const [selection, setSelection] = useState<Range | null>(null)

  // Helpers
  const getRect = () => squareRef.current?.getBoundingClientRect() ?? null

  const pointToCell = (clientX: number, clientY: number): CellIndex | null => {
    const rect = getRect()
    if (!rect) return null
    const x = clamp(clientX - rect.left, 0, Math.max(0, rect.width - 0.0001))
    const y = clamp(clientY - rect.top, 0, Math.max(0, rect.height - 0.0001))
    const c = clamp(Math.floor((x / rect.width) * 6), 0, 5)
    const r = clamp(Math.floor((y / rect.height) * 6), 0, 5)
    return { r, c }
  }

  const normalize = (a: CellIndex, b: CellIndex): Range => ({
    r0: Math.min(a.r, b.r),
    c0: Math.min(a.c, b.c),
    r1: Math.max(a.r, b.r),
    c1: Math.max(a.c, b.c),
  })

  const clearSelection = () => {
    setIsDragging(false)
    setStartCell(null)
    setSelection(null)
  }

  // ESC to clear selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Mouse handlers
  const handleSquareMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const start = pointToCell(e.clientX, e.clientY)
    if (!start) return
    setStartCell(start)
    // Replace existing selection immediately
    setSelection({ r0: start.r, c0: start.c, r1: start.r, c1: start.c })
    setIsDragging(true)
  }

  const handleCardMouseDown: React.MouseEventHandler<HTMLElement> = (e) => {
    // If the click is outside the square grid (but inside card), clear selection.
    const sq = squareRef.current
    if (!sq) return
    const target = e.target as Node
    if (!sq.contains(target)) {
      clearSelection()
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: MouseEvent) => {
      e.preventDefault()
      if (!startCell) return
      const end = pointToCell(e.clientX, e.clientY)
      if (!end) return
      setSelection(normalize(startCell, end))
    }

    const onUp = (e: MouseEvent) => {
      e.preventDefault()
      setIsDragging(false)
      setStartCell(null)
      // Persist selection; just remove the blue overlay by ending drag.
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, startCell])

  // Compute selection rectangle style (snapped to cells) while dragging
  const selectionRectStyle = (() => {
    if (!selection || !isDragging) return null
    const rect = getRect()
    if (!rect) return null
    const cellW = rect.width / 6
    const cellH = rect.height / 6
    const left = selection.c0 * cellW
    const top = selection.r0 * cellH
    const width = (selection.c1 - selection.c0 + 1) * cellW
    const height = (selection.r1 - selection.r0 + 1) * cellH
    return {
      left,
      top,
      width,
      height,
    } as React.CSSProperties
  })()

  const isSelected = (r: number, c: number) =>
    !!selection && r >= selection.r0 && r <= selection.r1 && c >= selection.c0 && c <= selection.c1

  const selectionStatus = (() => {
    if (!selection) return 'No selection'
    const { r0, r1, c0, c1 } = selection
    const count = (r1 - r0 + 1) * (c1 - c0 + 1)
    return `Selected: ${r0}–${r1} × ${c0}–${c1} • ${count} cell${count === 1 ? '' : 's'}`
  })()

  return (
    <section
      ref={cardRef}
      className="h-full bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col"
      onMouseDown={handleCardMouseDown}
    >
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {/* Keep the grid square and within available space */}
        <div className="w-full h-full max-w-full max-h-full aspect-square">
          {/* Interaction/measure target */}
          <div
            ref={squareRef}
            className="relative w-full h-full cursor-crosshair select-none"
            onMouseDown={handleSquareMouseDown}
          >
            {/* Selection overlay (shown while dragging only) */}
            {selectionRectStyle && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  aria-hidden
                  className="absolute rounded border border-blue-400/70 bg-blue-200/25"
                  style={selectionRectStyle}
                />
              </div>
            )}

            {/* 6×6 Grid */}
            <div className="grid grid-cols-6 grid-rows-6 w-full h-full gap-[3px]">
              {cells.map((cell) => {
                const selected = isSelected(cell.r, cell.c)
                const bgClass = selected ? 'bg-blue-100' : 'bg-white'
                return (
                  <div
                    key={`${cell.r}-${cell.c}`}
                    className={[
                      bgClass,
                      'border border-gray-200 rounded transition-colors duration-150',
                      'hover:border-gray-400',
                    ].join(' ')}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500">{selectionStatus}</div>
    </section>
  )
}

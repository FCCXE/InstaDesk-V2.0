import { useEffect, useRef, useState } from 'react'

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
  const squareRef = useRef<HTMLDivElement | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [startCell, setStartCell] = useState<CellIndex | null>(null)
  const [selection, setSelection] = useState<Range | null>(null)

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

  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const start = pointToCell(e.clientX, e.clientY)
    if (!start) return
    setStartCell(start)
    setSelection({ r0: start.r, c0: start.c, r1: start.r, c1: start.c })
    setIsDragging(true)
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
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, startCell])

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
    return { left, top, width, height }
  })()

  const isSelected = (r: number, c: number) =>
    !!selection && r >= selection.r0 && r <= selection.r1 && c >= selection.c0 && c <= selection.c1

  const selectedCount = (() => {
    if (!selection) return 0
    const { r0, r1, c0, c1 } = selection
    return (r1 - r0 + 1) * (c1 - c0 + 1)
  })()

  return (
    <section className="p-6">
      <div className="rounded-2xl border border-dashed border-[rgb(var(--id-border))] bg-white p-4">
        <div className="mx-auto max-w-[880px]">
          <div
            ref={squareRef}
            onMouseDown={handleMouseDown}
            className="relative mx-auto aspect-square w-full select-none"
          >
            {/* Selection overlay while dragging */}
            {selectionRectStyle && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute rounded-lg border-2 border-blue-300/70 bg-blue-200/20"
                  style={selectionRectStyle as React.CSSProperties}
                />
              </div>
            )}

            {/* Cells */}
            <div className="grid h-full w-full grid-cols-6 grid-rows-6 gap-3">
              {cells.map((cell) => (
                <div
                  key={`${cell.r}-${cell.c}`}
                  className={[
                    'rounded-lg border bg-white',
                    isSelected(cell.r, cell.c)
                      ? 'border-blue-300 ring-2 ring-blue-200/50'
                      : 'border-[rgb(var(--id-border))] hover:border-gray-300',
                  ].join(' ')}
                >
                  <div className="flex h-full items-center justify-center">
                    {/* center dot */}
                    <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 text-center text-[11px] text-[rgb(var(--id-text-muted))]">
            {selectedCount > 0 ? `${selectedCount}/36 selected` : '0/36 cells occupied'}
          </div>
        </div>
      </div>
    </section>
  )
}

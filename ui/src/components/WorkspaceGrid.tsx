import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAppState,   // central store
  cellKey,
} from '../state/AppState'
import { instanceStyleFor } from '../services/appsCatalog'
import { computeInstanceIndices } from '../services/instanceIndex'

type Cell = { r: number; c: number }

export default function WorkspaceGrid() {
  const { t } = useTranslation()
  // Keep your proven “cell mouse handlers + window mouseup” UX
  const draggingRef = useRef(false)

  // From AppState
  const {
    selection,            // Set<"r,c">
    assignments,          // Record<"r,c", AppId | null>
    argsOverridesByMonitor,
    currentMonitorId,
    currentGridCols,      // per-monitor grid size (Step 1 of grid-size build)
    currentGridRows,
    beginDrag,            // (r, c) => void
    updateDrag,           // (r, c) => void
    endDrag,              // () => void
    clearSelection,       // () => void
  } = useAppState()

  // Build the cell list dynamically from the current monitor's grid size.
  // Memo keyed on the dimensions so we don't re-allocate on every selection
  // tick — the array shape only changes when grid size does.
  const cells = useMemo<Cell[]>(
    () => Array.from({ length: currentGridRows * currentGridCols }, (_, i) => ({
      r: Math.floor(i / currentGridCols),
      c: i % currentGridCols,
    })),
    [currentGridCols, currentGridRows],
  )

  // Per-cell instance map for the CURRENT monitor. Used to pick a darker
  // shade + show a "#N" badge when 2+ regions of the same app live on this
  // monitor (differentiated by per-cell args override). Single-instance
  // grids skip both treatments — colors stay exactly as they were.
  const instanceMap = useMemo(
    () => computeInstanceIndices(
      assignments,
      argsOverridesByMonitor[currentMonitorId] ?? {},
    ),
    [assignments, argsOverridesByMonitor, currentMonitorId],
  )

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
    beginDrag(r, c, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey })
    e.preventDefault()
    e.stopPropagation()
  }

  const onCellMouseEnter = (r: number, c: number) => () => {
    if (!draggingRef.current) return
    updateDrag(r, c)
  }

  // Status line from central Set<CellKey>
  const status = useMemo(() => {
    if (selection.size === 0) {
      const assignedCount = Object.values(assignments).filter(Boolean).length
      return assignedCount === 0
        ? t('grid.noSelection')
        : t('grid.noSelectionAssigned', { count: assignedCount })
    }
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
    return t('grid.selected', { range: `${rMin}–${rMax + 1} × ${cMin}–${cMax + 1}`, count })
  }, [selection, assignments, t])

  const isHighlighted = (r: number, c: number) => selection.has(cellKey(r, c))

  return (
    <section className="h-full w-full bg-surface rounded-xl border border-line shadow-sm p-3 flex flex-col">
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="w-full h-full max-w-full max-h-full aspect-square">
          <div className="relative w-full h-full select-none">
            {/* Grid */}
            <div
              className="grid w-full h-full gap-[3px]"
              style={{
                gridTemplateColumns: `repeat(${currentGridCols}, 1fr)`,
                gridTemplateRows: `repeat(${currentGridRows}, 1fr)`,
              }}
            >
              {cells.map(({ r, c }) => {
                const highlighted = isHighlighted(r, c)
                const k = cellKey(r, c)
                const assigned = assignments[k] ?? null
                const inst = assigned ? instanceMap[k] : undefined
                const instanceIdx = inst?.instanceIndex ?? 0
                const totalInst = inst?.totalInstances ?? 1
                const style = assigned ? instanceStyleFor(assigned, instanceIdx) : null

                const baseClasses = 'border rounded transition-colors flex items-center justify-center text-[10px] font-medium overflow-hidden'
                const classes = style
                  ? `${baseClasses} ${style.fill} ${style.ring} text-slate-700`
                  : `${baseClasses} ${highlighted ? 'border-blue-300' : 'border-line'} text-muted`

                // Tooltip: when there are multiple instances of this app,
                // surface the args so the user can identify each region
                // without opening the Apps tab. Single-instance cells get
                // just the app name (existing behavior).
                const titleText = assigned
                  ? (totalInst > 1
                      ? `${assigned} #${instanceIdx + 1}${inst?.args ? ` — ${inst.args}` : ' — default args'}`
                      : assigned)
                  : undefined

                return (
                  <div
                    key={`${r}-${c}`}
                    onMouseDown={onCellMouseDown(r, c)}
                    onMouseEnter={onCellMouseEnter(r, c)}
                    className={classes}
                    style={{
                      backgroundColor: !style && highlighted ? 'rgba(59,130,246,0.18)' : undefined,
                      boxShadow: highlighted ? 'inset 0 0 0 2px rgba(37,99,235,0.55)' : undefined,
                      cursor: 'crosshair',
                    }}
                    title={titleText}
                  >
                    {assigned && (
                      <span className="truncate px-1">
                        {totalInst > 1 && (
                          <span className="mr-1 inline-flex items-center justify-center rounded bg-white/70 px-1 text-[9px] font-semibold text-slate-600 ring-1 ring-slate-300">
                            #{instanceIdx + 1}
                          </span>
                        )}
                        {assigned}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-muted">{status}</div>
    </section>
  )
}

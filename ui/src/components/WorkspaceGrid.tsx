import React, { useEffect, useMemo, useRef, useState } from 'react'
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
    monitors,             // for the selected monitor's real aspect ratio
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

  // Selected monitor's real aspect ratio (w/h reflects physical orientation —
  // a portrait monitor reads as tall).
  const monAspect = useMemo(() => {
    const m = monitors.find((mm) => mm.id === currentMonitorId)
    return m && m.w > 0 && m.h > 0 ? m.w / m.h : 16 / 9
  }, [monitors, currentMonitorId])

  // Size the grid to FILL its container, but clamp the cell aspect between
  // square (1:1) and the monitor's true aspect. So it fills honestly when the
  // container shape is close to the monitor's, and falls back to neutral square
  // cells (never skinny-stretched) when the container is a very different shape.
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const arLo = Math.min(1, monAspect)
    const arHi = Math.max(1, monAspect)
    const compute = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw <= 0 || ch <= 0) return
      const targetAR = Math.min(arHi, Math.max(arLo, cw / ch))
      let bw = cw
      let bh = cw / targetAR
      if (bh > ch) { bh = ch; bw = ch * targetAR }
      setBox({ w: Math.round(bw), h: Math.round(bh) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [monAspect])

  return (
    <section className="h-full w-full bg-surface rounded-xl border border-line shadow-sm p-3 flex flex-col">
      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center">
        {/* Grid box: fills the container with cell aspect clamped between square
            and the monitor's true aspect (computed above). */}
        <div className="relative select-none" style={{ width: box.w, height: box.h }}>
          {/* Grid */}
          <div
            className="grid h-full w-full gap-[3px]"
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
                // The catalog `fill` values are light pastels (e.g. bg-sky-50);
                // on the dark board they look out of place and the dark cell
                // text becomes unreadable. In dark mode neutralize the fill to a
                // faint tint and lighten the text — the colored ring + dot still
                // carry each app's hue, so cells stay distinguishable.
                const classes = style
                  ? `${baseClasses} ${style.fill} dark:bg-white/[0.07] ${style.ring} text-slate-700 dark:text-slate-200`
                  : `${baseClasses} ${highlighted ? 'border-blue-300 dark:border-primary/60' : 'border-line'} text-muted`

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
                          <span className="mr-1 inline-flex items-center justify-center rounded bg-white/70 px-1 text-[9px] font-semibold text-slate-600 ring-1 ring-slate-300 dark:bg-white/15 dark:text-slate-200 dark:ring-white/20">
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

      <div className="mt-3 text-[11px] text-muted">{status}</div>
    </section>
  )
}

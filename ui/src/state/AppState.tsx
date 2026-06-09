import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, type ApiMonitor } from '../services/api'

/* ============================================================================
   Grid constants
   ==========================================================================
   GRID_ROWS / GRID_COLS are the DEFAULT grid dimensions assigned to any
   monitor that doesn't have an explicit per-monitor override in
   gridSizeByMonitor (see Provider below). Per-monitor override is the
   primary user-facing control (bottom-bar picker, Step 2 of this build);
   these constants are the fallback used for newly-discovered monitors and
   for any consumer that hasn't been updated to read per-monitor state yet.
   ========================================================================== */
export const GRID_ROWS = 6
export const GRID_COLS = 6

// Discrete preset set per 2026-06-09 product decision (validated against
// Divvy's 6×6 default + ultrawide user data via WebSearch).
export const GRID_SIZE_PRESETS: ReadonlyArray<{ cols: number; rows: number }> = [
  { cols: 4, rows: 4 },
  { cols: 6, rows: 6 },
  { cols: 8, rows: 8 },
  { cols: 10, rows: 10 },
]

// Window margin presets (bezel-aware feature, 2026-06-09): pixel padding
// applied to every monitor's work area. Pulls snapped windows back from
// monitor edges by `m` pixels uniformly, leaving room for physical bezels
// and aesthetic breathing room. Adjacent windows on the SAME monitor
// still touch each other (no internal bezel to compensate for).
export const WINDOW_MARGIN_PRESETS: ReadonlyArray<number> = [0, 4, 8, 12, 16]

export type GridSize = { cols: number; rows: number }
export type GridSizeByMonitor = Record<string, GridSize>

// localStorage keys.
//   gridSizeByMonitor — sparse per-monitor override map.
//   defaultGridSize   — Settings → Default value used as the fallback for
//                       any monitor without an explicit entry in the
//                       sparse map above. Initial fallback is 6×6.
const GRID_SIZE_STORAGE_KEY = 'instadesk:gridSizeByMonitor'
const DEFAULT_GRID_SIZE_STORAGE_KEY = 'instadesk:defaultGridSize'

function loadGridSizeByMonitor(): GridSizeByMonitor {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(GRID_SIZE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as GridSizeByMonitor
    return {}
  } catch {
    return {}
  }
}

function saveGridSizeByMonitor(value: GridSizeByMonitor) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(GRID_SIZE_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage can throw under private-mode / quota-exceeded — silently
    // ignore. Settings persistence is a nice-to-have, not load-bearing.
  }
}

function loadDefaultGridSize(): GridSize {
  if (typeof window === 'undefined') return { cols: GRID_COLS, rows: GRID_ROWS }
  try {
    const raw = window.localStorage.getItem(DEFAULT_GRID_SIZE_STORAGE_KEY)
    if (!raw) return { cols: GRID_COLS, rows: GRID_ROWS }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object'
        && typeof parsed.cols === 'number' && typeof parsed.rows === 'number') {
      return { cols: parsed.cols, rows: parsed.rows }
    }
    return { cols: GRID_COLS, rows: GRID_ROWS }
  } catch {
    return { cols: GRID_COLS, rows: GRID_ROWS }
  }
}

function saveDefaultGridSize(value: GridSize) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEFAULT_GRID_SIZE_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Same silent fallback as above.
  }
}

const WINDOW_MARGIN_STORAGE_KEY = 'instadesk:windowMargin'

function loadWindowMargin(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(WINDOW_MARGIN_STORAGE_KEY)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  } catch {
    return 0
  }
}

function saveWindowMargin(value: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WINDOW_MARGIN_STORAGE_KEY, String(value))
  } catch {
    // Same silent fallback.
  }
}

export type CellKey = string
// IMPORTANT: keep comma (compatible with existing WorkspaceGrid.tsx)
export const cellKey = (r: number, c: number): CellKey => `${r},${c}`

/* ============================================================================
   Demo Apps catalog
   ========================================================================== */
export type AppId = 'Outlook' | 'Chrome' | 'VS Code' | 'Notepad' | 'GitHub'
export const APPS: Record<AppId, { id: AppId; category: string }> = {
  Outlook: { id: 'Outlook', category: 'Communication' },
  Chrome: { id: 'Chrome', category: 'Browser' },
  'VS Code': { id: 'VS Code', category: 'Development' },
  Notepad: { id: 'Notepad', category: 'Text' },
  GitHub: { id: 'GitHub', category: 'Development' },
}

/* ============================================================================
   Internal helpers for grid selection
   ========================================================================== */
type Assignments = Record<CellKey, AppId | null>
// Per-monitor empty-grid factory. Defaults to GRID_COLS × GRID_ROWS for
// monitors without an explicit grid-size override, matching legacy behaviour.
const makeEmptyAssignments = (cols: number = GRID_COLS, rows: number = GRID_ROWS): Assignments => {
  const obj: Assignments = {}
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      obj[cellKey(r, c)] = null
    }
  }
  return obj
}

const rectSelectionSet = (r1: number, c1: number, r2: number, c2: number): Set<CellKey> => {
  const set = new Set<CellKey>()
  const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2)
  const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2)
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      set.add(cellKey(r, c))
    }
  }
  return set
}
const unionSets = (a: Set<CellKey>, b: Set<CellKey>) => {
  const out = new Set<CellKey>(a)
  b.forEach((k) => out.add(k))
  return out
}

/* ============================================================================
   Monitors + Presets (for MonitorSelector & DisplayArray)
   ========================================================================== */
export type Monitor = {
  id: string
  name: string
  role: 'Primary' | 'Secondary'
  resolution: string
  active: boolean
  // Visual-only layout for Display Array (normalized SVG coords)
  x: number; y: number; w: number; h: number
  orientation?: 'landscape' | 'portrait'
}

// SVG viewBox dimensions used by DisplayArray. Real monitor bounds are
// scaled into this space so the diagram reflects physical layout.
const VBW = 1000
const VBH = 360

function realToMonitors(real: ApiMonitor[]): Monitor[] {
  if (real.length === 0) return []
  const xMin = Math.min(...real.map(m => m.bounds.x))
  const yMin = Math.min(...real.map(m => m.bounds.y))
  const xMax = Math.max(...real.map(m => m.bounds.x + m.bounds.w))
  const yMax = Math.max(...real.map(m => m.bounds.y + m.bounds.h))
  const unionW = Math.max(1, xMax - xMin)
  const unionH = Math.max(1, yMax - yMin)
  const pad = 0.06
  const scale = Math.min((VBW * (1 - 2 * pad)) / unionW, (VBH * (1 - 2 * pad)) / unionH)
  const offsetX = (VBW - unionW * scale) / 2 - xMin * scale
  const offsetY = (VBH - unionH * scale) / 2 - yMin * scale
  return real.map(m => ({
    id: `m${m.index}`,
    name: `Monitor ${m.index}`,
    role: m.primary ? 'Primary' : 'Secondary',
    resolution: `${m.bounds.w}×${m.bounds.h}`,
    active: true,
    x: m.bounds.x * scale + offsetX,
    y: m.bounds.y * scale + offsetY,
    w: m.bounds.w * scale,
    h: m.bounds.h * scale,
    orientation: m.bounds.h > m.bounds.w ? 'portrait' : 'landscape',
  }))
}

// Mock layout used as a placeholder until /monitors resolves (~200ms).
const SAMPLE_MONITORS: Monitor[] = [
  { id: 'm3', name: 'Monitor 3', role: 'Secondary', resolution: '1920×1080', active: true,
    x: 220, y: 160, w: 260, h: 90, orientation: 'landscape' },
  { id: 'm2', name: 'Monitor 2', role: 'Secondary', resolution: '1920×1080', active: true,
    x: 480, y: 160, w: 260, h: 90, orientation: 'landscape' },
  { id: 'm4', name: 'Monitor 4', role: 'Secondary', resolution: '1280×720',  active: true,
    x: 470, y: 110, w: 120, h: 45, orientation: 'landscape' },
  { id: 'm1', name: 'Monitor 1', role: 'Primary',   resolution: '2560×1440', active: true,
    x: 760, y: 140, w: 70,  h: 150, orientation: 'portrait' },
]

// Presets (visual-only)
export type PresetId = 'daily-desk' | 'coding' | 'meetings' | 'research' | 'design' | 'monitoring'
export type Preset = { id: PresetId; name: string; note?: string }

const SAMPLE_PRESETS: Preset[] = [
  { id: 'daily-desk', name: 'Daily Desk', note: 'Email, Browser, Notes' },
  { id: 'coding',     name: 'Coding',     note: 'IDE, Docs, Terminal' },
  { id: 'meetings',   name: 'Meetings',   note: 'Calendar, Teams/Meet' },
  { id: 'research',   name: 'Research',   note: 'Browser groups' },
  { id: 'design',     name: 'Design',     note: 'Canvas & Assets' },
  { id: 'monitoring', name: 'Monitoring', note: 'Dashboards' },
]

/* ============================================================================
   URL Builder (state-only for Phase A)
   ========================================================================== */
export type UrlOpenMode = 'single' | 'per-group' | 'per-url'
export type UrlGroup = { id: string; title: string; urls: string[] }
export type UrlBuilderDraft = { browser: string | null; tabGroups: UrlGroup[]; openMode: UrlOpenMode }

const INITIAL_BROWSERS = ['Chrome', 'Edge', 'Firefox']
const newGroup = (idSeed: number): UrlGroup => ({ id: `g${idSeed}`, title: '', urls: ['', ''] })

/* ============================================================================
   Context surface (superset so existing components keep working)
   ========================================================================== */
type Modifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

type AppStateContext = {
  // selection as Set<CellKey> (used by WorkspaceGrid)
  selection: Set<CellKey>
  assignments: Assignments
  selectedApp: AppId | null
  clipboard: Assignments | null

  setSelectedApp: (app: AppId | null) => void

  // drag/select API (WorkspaceGrid uses this)
  beginDrag: (row: number, col: number, modifiers?: Modifiers) => void
  updateDrag: (row: number, col: number) => void
  endDrag: () => void
  toggleCell: (row: number, col: number) => void
  clearSelection: () => void

  // assign/unassign to selected cells
  assignSelected: () => void
  unassignSelected: () => void

  // simple grid ops (operate on the CURRENT monitor's grid)
  clearGrid: () => void
  copyGrid: () => void
  pasteGrid: () => void

  // bulk replace (used by "Load Layout" to rehydrate from a saved preset).
  // replaceGrid replaces ONE monitor's cells; replaceGridMulti replaces
  // multiple monitors at once and switches the selector to `switchTo`.
  replaceGrid: (
    cells: Record<string, string>,
    monitorId?: string,
    argsOverrides?: Record<string, string>,
  ) => void
  replaceGridMulti: (
    cellsByMonitorId: Record<string, Record<string, string>>,
    switchTo?: string,
    argsByMonitorId?: Record<string, Record<string, string>>,
  ) => void

  // multi-monitor read access — the saved-layout flow needs the assignments
  // map for ALL monitors, not just the visible one.
  assignmentsByMonitor: Record<string, Assignments>
  assignedCountTotal: number

  // Per-cell args overrides — parallel map keyed by monitor, then cell.
  // Lets two regions of the same app (e.g., two File Explorer windows)
  // differentiate via distinct launch args ("C:\Downloads" vs "D:\Projects").
  // Empty string / missing entry = use the catalog default.
  argsOverridesByMonitor: Record<string, Record<string, string>>
  // The args value currently shared by the selection's cells, or "" if the
  // selection spans cells with mixed/no overrides. Editable via setArgs.
  argsForSelection: string
  hasMixedArgsInSelection: boolean
  setArgsForSelection: (args: string) => void

  // Which Layout the user is currently editing — set when they click Edit
  // on a Layout card, cleared on Save/Cancel/+New. Lives in global state
  // (not LayoutsPane local) so it survives Apps/Layouts tab toggles. The
  // value is the Layout's card id (e.g. "general_B"); LayoutsPane derives
  // kind+slot from this when saving back to that specific slot.
  editingLayoutId: string | null
  setEditingLayoutId: (id: string | null) => void

  // monitors + presets
  monitors: Monitor[]
  currentMonitorId: string
  setCurrentMonitor: (id: string) => void

  // Per-monitor grid dimensions (Step 1 of the grid-size build, 2026-06-09).
  // gridSizeByMonitor is sparse: only monitors with an explicit user
  // override appear here. currentGridCols/Rows are the derived dimensions
  // for the active monitor — consumers (WorkspaceGrid, future Snap popup
  // sizing, future per-layout save/load) should read these instead of
  // importing the static GRID_COLS/GRID_ROWS constants directly.
  // setGridSizeForMonitor is the setter the bottom-bar picker (Step 2) and
  // the per-layout load flow (Step 3) will use.
  gridSizeByMonitor: GridSizeByMonitor
  currentGridCols: number
  currentGridRows: number
  setGridSizeForMonitor: (monitorId: string, size: GridSize) => void

  // Global default grid size — applied to any monitor without an explicit
  // entry in gridSizeByMonitor. Configurable from Settings → General.
  // Changing the default does NOT retroactively disturb existing monitors:
  // setDefaultGridSize auto-pins every currently-discovered monitor that
  // lacks an explicit override to whatever size it was effectively using
  // BEFORE the default change, so assignments on those monitors are safe.
  defaultGridSize: GridSize
  setDefaultGridSize: (size: GridSize) => void

  // Atomic combined action: set a monitor's grid size AND clear that
  // monitor's assignments + args + (if it was the Edit-mode target) exit
  // Edit mode. Used by the bottom-bar picker when the operator confirms a
  // resize on a monitor with assigned cells. Empty-grid resizes call this
  // too (clear is a no-op there) so the path is single-source.
  resizeMonitor: (monitorId: string, size: GridSize) => void

  // Bezel-aware window margin (2026-06-09): pixel padding applied to
  // every monitor's work area before computing cell rects in the agent.
  // Pulls snapped windows back from monitor edges, leaving room for
  // physical bezels. Passed via --cell-margin-px to the WinAgent on every
  // placement call (Snap popup, Layout Apply, single Launch).
  windowMargin: number
  setWindowMargin: (px: number) => void

  presets: Preset[]
  pendingPresetByMonitor: Record<string, PresetId | null>
  setPendingPreset: (monitorId: string, preset: PresetId | null) => void
  getPendingPreset: (monitorId: string) => PresetId | null

  // URL Builder
  urlBuilder: UrlBuilderDraft
  browsers: string[]
  setUrlBrowser: (name: string | null) => void
  addBrowser: (name: string) => void
  addTabGroup: () => void
  setTabTitle: (groupId: string, title: string) => void
  setUrlLine: (groupId: string, index: number, value: string) => void
  addUrlLine: (groupId: string) => void
  resetUrlBuilder: () => void
  saveUrlBuilder: () => UrlBuilderDraft
  previewUrlBuilder: () => UrlBuilderDraft
  setOpenMode: (mode: UrlOpenMode) => void
}

const Ctx = createContext<AppStateContext | null>(null)
export function useAppState() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

/* ============================================================================
   Provider
   ========================================================================== */
export const AppStateProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  /* ---------- Core grid state ---------- */
  const [selection, setSelection] = useState<Set<CellKey>>(new Set())
  // Per-monitor assignments: each monitor keeps its own grid configuration.
  // The visible `assignments` derived below is the current monitor's slice.
  const [assignmentsByMonitor, setAssignmentsByMonitor] = useState<Record<string, Assignments>>({})
  // Parallel per-monitor map for cell args overrides. Sparse: only cells
  // with a non-default override appear here.
  const [argsOverridesByMonitor, setArgsOverridesByMonitor] = useState<Record<string, Record<string, string>>>({})
  const [selectedApp, setSelectedApp] = useState<AppId | null>(null)
  const [clipboard, setClipboard] = useState<Assignments | null>(null)
  const [clipboardArgs, setClipboardArgs] = useState<Record<string, string> | null>(null)
  const [editingLayoutId, setEditingLayoutId] = useState<string | null>(null)

  // drag bookkeeping
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ r: number; c: number } | null>(null)
  const additiveRef = useRef(false)
  const baseSelectionRef = useRef<Set<CellKey>>(new Set())

  const beginDrag = (row: number, col: number, modifiers?: Modifiers) => {
    const additive = Boolean(modifiers?.ctrlKey || modifiers?.metaKey || modifiers?.shiftKey)
    isDraggingRef.current = true
    dragStartRef.current = { r: row, c: col }
    additiveRef.current = additive
    baseSelectionRef.current = additive ? new Set(selection) : new Set()
    const initial = rectSelectionSet(row, col, row, col)
    setSelection(additive ? unionSets(baseSelectionRef.current, initial) : initial)
  }
  const updateDrag = (row: number, col: number) => {
    if (!isDraggingRef.current || !dragStartRef.current) return
    const { r, c } = dragStartRef.current
    const rect = rectSelectionSet(r, c, row, col)
    setSelection(additiveRef.current ? unionSets(baseSelectionRef.current, rect) : rect)
  }
  const endDrag = () => {
    isDraggingRef.current = false
    dragStartRef.current = null
  }
  const toggleCell = (row: number, col: number) => {
    const k = cellKey(row, col)
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  const clearSelection = () => setSelection(new Set())

  /* ---------- Monitors + presets (need monitor id before grid ops) ---------- */
  const [monitors, setMonitors] = useState<Monitor[]>(SAMPLE_MONITORS)
  const [currentMonitorId, setCurrentMonitorId] = useState<string>('m1')
  const setCurrentMonitor = (id: string) => setCurrentMonitorId(id)

  /* ---------- Per-monitor grid size (Steps 1+2 of the 4-step build) ---------- */
  const [gridSizeByMonitor, setGridSizeByMonitorState] = useState<GridSizeByMonitor>(loadGridSizeByMonitor)
  const [defaultGridSize, setDefaultGridSizeState] = useState<GridSize>(loadDefaultGridSize)

  /* ---------- Window margin (bezel-aware, 2026-06-09) ---------- */
  const [windowMargin, setWindowMarginState] = useState<number>(loadWindowMargin)

  useEffect(() => {
    saveWindowMargin(windowMargin)
  }, [windowMargin])

  const setWindowMargin = (px: number) => {
    setWindowMarginState(Math.max(0, Math.floor(px)))
  }

  // Persist on every change. Sparse map → small writes.
  useEffect(() => {
    saveGridSizeByMonitor(gridSizeByMonitor)
  }, [gridSizeByMonitor])

  useEffect(() => {
    saveDefaultGridSize(defaultGridSize)
  }, [defaultGridSize])

  // Active size for the current monitor: per-monitor override → default → 6×6.
  const currentGridSize = gridSizeByMonitor[currentMonitorId]
  const currentGridCols = currentGridSize?.cols ?? defaultGridSize.cols
  const currentGridRows = currentGridSize?.rows ?? defaultGridSize.rows

  const setGridSizeForMonitor = (monitorId: string, size: GridSize) => {
    setGridSizeByMonitorState((prev) => ({ ...prev, [monitorId]: size }))
  }

  // Changing the global default must not retroactively change any monitor
  // that already has user-visible assignments. We "pin" every currently-
  // discovered monitor that lacks an explicit override to its CURRENT
  // effective size, THEN update the default. After this, only truly new
  // monitors plugged in later get the new default value.
  const setDefaultGridSize = (size: GridSize) => {
    setGridSizeByMonitorState((prev) => {
      const next: GridSizeByMonitor = { ...prev }
      for (const m of monitors) {
        if (!next[m.id]) {
          // Pin to the OLD default since that's what this monitor is
          // currently rendering at.
          next[m.id] = { cols: defaultGridSize.cols, rows: defaultGridSize.rows }
        }
      }
      return next
    })
    setDefaultGridSizeState(size)
  }

  // Atomic resize: set new size + clear that monitor's assignments + clear
  // its args overrides + (if it was the Edit-mode target) exit Edit mode.
  // Centralizes the wipe-on-confirm flow so the bottom-bar picker doesn't
  // need to coordinate three separate state updates.
  const resizeMonitor = (monitorId: string, size: GridSize) => {
    setGridSizeByMonitorState((prev) => ({ ...prev, [monitorId]: size }))
    setAssignmentsByMonitor((prev) => ({
      ...prev,
      [monitorId]: makeEmptyAssignments(size.cols, size.rows),
    }))
    setArgsOverridesByMonitor((prev) => ({ ...prev, [monitorId]: {} }))
    // Exit Edit mode if it was targeting a layout — operator decision Y
    // (auto-exit on confirm). The picker UI is responsible for surfacing
    // this fact in its confirm dialog so the user isn't surprised.
    setEditingLayoutId(null)
  }

  // Current monitor's view onto assignmentsByMonitor.
  const assignments: Assignments = useMemo(
    () => assignmentsByMonitor[currentMonitorId] ?? makeEmptyAssignments(),
    [assignmentsByMonitor, currentMonitorId]
  )

  // Total non-null cells across ALL monitors (used by + New Layout).
  const assignedCountTotal = useMemo(
    () => Object.values(assignmentsByMonitor).reduce(
      (sum, a) => sum + Object.values(a).filter(Boolean).length, 0,
    ),
    [assignmentsByMonitor]
  )

  // Helpers that mutate ONLY the current monitor's slice.
  const setCurrentMonitorAssignments = (next: Assignments) => {
    setAssignmentsByMonitor((prev) => ({ ...prev, [currentMonitorId]: next }))
  }
  const setCurrentMonitorArgs = (next: Record<string, string>) => {
    setArgsOverridesByMonitor((prev) => ({ ...prev, [currentMonitorId]: next }))
  }

  const assignSelected = () => {
    if (!selectedApp) return
    const next: Assignments = { ...assignments }
    selection.forEach((k) => { next[k] = selectedApp })
    setCurrentMonitorAssignments(next)
  }
  const unassignSelected = () => {
    const next: Assignments = { ...assignments }
    const nextArgs = { ...(argsOverridesByMonitor[currentMonitorId] ?? {}) }
    selection.forEach((k) => {
      next[k] = null
      delete nextArgs[k]   // unassigning a cell clears its override too
    })
    setCurrentMonitorAssignments(next)
    setCurrentMonitorArgs(nextArgs)
  }

  // Clear All — operator decision 2026-06-09 (α + i): clears the current
  // monitor's cells AND removes that monitor's per-monitor grid-size
  // override so it falls back to the global Settings default going forward.
  // Removing the override (not pinning) means the monitor follows future
  // Settings changes — matches the "reset to default" mental model.
  const clearGrid = () => {
    setGridSizeByMonitorState((prev) => {
      if (!(currentMonitorId in prev)) return prev
      const next = { ...prev }
      delete next[currentMonitorId]
      return next
    })
    // The cleared grid lives at the global default size from now on.
    setCurrentMonitorAssignments(makeEmptyAssignments(defaultGridSize.cols, defaultGridSize.rows))
    setCurrentMonitorArgs({})
  }
  const copyGrid = () => {
    setClipboard({ ...assignments })
    setClipboardArgs({ ...(argsOverridesByMonitor[currentMonitorId] ?? {}) })
  }
  const pasteGrid = () => {
    if (clipboard) setCurrentMonitorAssignments({ ...clipboard })
    if (clipboardArgs) setCurrentMonitorArgs({ ...clipboardArgs })
  }

  // Replace ONE monitor's grid. Cells outside the provided map are cleared.
  // If monitorId is given, switch the selector after the write.
  const replaceGrid = (
    cells: Record<string, string>,
    monitorId?: string,
    argsOverrides?: Record<string, string>,
  ) => {
    const next = makeEmptyAssignments()
    for (const [k, app] of Object.entries(cells)) {
      if (k in next) next[k] = app as AppId
    }
    const targetId = monitorId ?? currentMonitorId
    setAssignmentsByMonitor((prev) => ({ ...prev, [targetId]: next }))
    setArgsOverridesByMonitor((prev) => ({ ...prev, [targetId]: { ...(argsOverrides ?? {}) } }))
    setSelection(new Set())
    if (monitorId) setCurrentMonitorId(monitorId)
  }

  // Replace MULTIPLE monitors' grids at once (used by Load on multi-monitor
  // presets). Any monitor in the current state but absent from the input
  // map gets cleared, so the loaded preset is the only state visible.
  const replaceGridMulti = (
    cellsByMonitorId: Record<string, Record<string, string>>,
    switchTo?: string,
    argsByMonitorId?: Record<string, Record<string, string>>,
  ) => {
    const next: Record<string, Assignments> = {}
    const nextArgs: Record<string, Record<string, string>> = {}
    for (const [monId, cells] of Object.entries(cellsByMonitorId)) {
      const a: Assignments = makeEmptyAssignments()
      for (const [k, app] of Object.entries(cells)) {
        if (k in a) a[k] = app as AppId
      }
      next[monId] = a
      nextArgs[monId] = { ...((argsByMonitorId ?? {})[monId] ?? {}) }
    }
    setAssignmentsByMonitor(next)
    setArgsOverridesByMonitor(nextArgs)
    setSelection(new Set())
    if (switchTo) setCurrentMonitorId(switchTo)
  }

  /* ---------- Per-cell args overrides ---------- */
  // Derived view: what args string the current selection shares (or "" if
  // it's empty / mixed). Used by RightPane's args input to show "current".
  const { argsForSelection, hasMixedArgsInSelection } = useMemo(() => {
    if (selection.size === 0) return { argsForSelection: '', hasMixedArgsInSelection: false }
    const overrides = argsOverridesByMonitor[currentMonitorId] ?? {}
    const values = new Set<string>()
    selection.forEach((k) => { values.add(overrides[k] ?? '') })
    if (values.size === 1) return { argsForSelection: values.values().next().value ?? '', hasMixedArgsInSelection: false }
    return { argsForSelection: '', hasMixedArgsInSelection: true }
  }, [selection, argsOverridesByMonitor, currentMonitorId])

  const setArgsForSelection = (args: string) => {
    if (selection.size === 0) return
    const nextArgs = { ...(argsOverridesByMonitor[currentMonitorId] ?? {}) }
    const trimmed = args.trim()
    selection.forEach((k) => {
      if (trimmed === '') delete nextArgs[k]
      else nextArgs[k] = trimmed
    })
    setCurrentMonitorArgs(nextArgs)
  }

  /* ---------- Monitors + presets (state declared above grid ops) ---------- */
  // Fetch real monitor layout from the agent (via FastAPI) on mount.
  useEffect(() => {
    let alive = true
    api.monitors().then(res => {
      if (!alive || !res.ok) return
      const real = realToMonitors(res.monitors)
      if (real.length === 0) return
      setMonitors(real)
      const primary = real.find(m => m.role === 'Primary') ?? real[0]
      setCurrentMonitorId(prev => real.some(m => m.id === prev) ? prev : primary.id)
    }).catch(err => {
      console.warn('[InstaDesk] /monitors fetch failed; keeping mock data:', err)
    })
    return () => { alive = false }
  }, [])

  const [presets] = useState<Preset[]>(SAMPLE_PRESETS)
  const [pendingPresetByMonitor, setPendingPresetByMonitor] = useState<Record<string, PresetId | null>>({
    m1: null, m2: null, m3: null, m4: null,
  })
  const setPendingPreset = (monitorId: string, preset: PresetId | null) =>
    setPendingPresetByMonitor(prev => ({ ...prev, [monitorId]: preset }))
  const getPendingPreset = (monitorId: string) => pendingPresetByMonitor[monitorId] ?? null

  /* ---------- URL Builder ---------- */
  const [browsers, setBrowsers] = useState<string[]>(INITIAL_BROWSERS)
  const [groupSeed, setGroupSeed] = useState(2)
  const [urlBuilder, setUrlBuilder] = useState<UrlBuilderDraft>({
    browser: null,
    tabGroups: [newGroup(1), newGroup(2)],
    openMode: 'single',
  })

  const setUrlBrowser = (name: string | null) => setUrlBuilder(prev => ({ ...prev, browser: name }))
  const addBrowser = (name: string) =>
    setBrowsers(prev => (prev.includes(name) ? prev : [...prev, name]))

  const addTabGroup = () => setUrlBuilder(prev => {
    const id = groupSeed + 1
    setGroupSeed(id
    )
    return { ...prev, tabGroups: [...prev.tabGroups, newGroup(id)] }
  })
  const setTabTitle = (groupId: string, title: string) =>
    setUrlBuilder(prev => ({
      ...prev,
      tabGroups: prev.tabGroups.map(g => g.id === groupId ? { ...g, title } : g)
    }))
  const setUrlLine = (groupId: string, index: number, value: string) =>
    setUrlBuilder(prev => ({
      ...prev,
      tabGroups: prev.tabGroups.map(g =>
        g.id !== groupId ? g : { ...g, urls: g.urls.map((u, i) => i === index ? value : u) }
      )
    }))
  const addUrlLine = (groupId: string) =>
    setUrlBuilder(prev => ({
      ...prev,
      tabGroups: prev.tabGroups.map(g => g.id !== groupId ? g : { ...g, urls: [...g.urls, ''] })
    }))
  const resetUrlBuilder = () =>
    setUrlBuilder({ browser: null, tabGroups: [newGroup(1), newGroup(2)], openMode: 'single' })
  const saveUrlBuilder = () => urlBuilder
  const previewUrlBuilder = () => urlBuilder
  const setOpenMode = (mode: UrlOpenMode) =>
    setUrlBuilder(prev => ({ ...prev, openMode: mode }))

  /* ---------- Context value ---------- */
  const value = useMemo<AppStateContext>(() => ({
    // grid
    selection,
    assignments,
    selectedApp,
    clipboard,
    setSelectedApp,
    beginDrag,
    updateDrag,
    endDrag,
    toggleCell,
    clearSelection,
    assignSelected,
    unassignSelected,
    clearGrid,
    copyGrid,
    pasteGrid,
    replaceGrid,
    replaceGridMulti,
    assignmentsByMonitor,
    assignedCountTotal,
    argsOverridesByMonitor,
    argsForSelection,
    hasMixedArgsInSelection,
    setArgsForSelection,
    editingLayoutId,
    setEditingLayoutId,

    // monitors + presets
    monitors,
    currentMonitorId,
    setCurrentMonitor,
    presets,
    pendingPresetByMonitor,
    setPendingPreset,
    getPendingPreset,

    // per-monitor grid size (Steps 1+2 of grid-size build)
    gridSizeByMonitor,
    currentGridCols,
    currentGridRows,
    setGridSizeForMonitor,
    defaultGridSize,
    setDefaultGridSize,
    resizeMonitor,
    // window margin (bezel-aware)
    windowMargin,
    setWindowMargin,

    // URL builder
    urlBuilder,
    browsers,
    setUrlBrowser,
    addBrowser,
    addTabGroup,
    setTabTitle,
    setUrlLine,
    addUrlLine,
    resetUrlBuilder,
    saveUrlBuilder,
    previewUrlBuilder,
    setOpenMode,
  }), [
    selection, assignments, assignmentsByMonitor, assignedCountTotal,
    argsOverridesByMonitor, argsForSelection, hasMixedArgsInSelection,
    editingLayoutId,
    selectedApp, clipboard,
    monitors, currentMonitorId, presets, pendingPresetByMonitor,
    gridSizeByMonitor, currentGridCols, currentGridRows, defaultGridSize,
    windowMargin,
    urlBuilder, browsers
  ])

  /* ---------- Dev console hook (localhost/Vite dev only) ---------- */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isDev = (import.meta as any)?.env?.DEV === true
    const isLocalhost = typeof location !== 'undefined' && location.hostname === 'localhost'
    if (!(isDev || isLocalhost)) return
    try {
      ;(window as any).$insta = value
      ;(globalThis as any).$insta = value
      console.info('[InstaDesk] AppState exposed on window.$insta')
    } catch {}
    return () => {
      try {
        if ((window as any).$insta === value) delete (window as any).$insta
        if ((globalThis as any).$insta === value) delete (globalThis as any).$insta
      } catch {}
    }
  }, [value])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

import React, { createContext, useContext, useMemo, useRef, useState } from 'react'

/* ============================================================================
   Grid constants
   ========================================================================== */
export const GRID_ROWS = 6
export const GRID_COLS = 6

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
const makeEmptyAssignments = (): Assignments => {
  const obj: Assignments = {}
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
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

// Sample Windows-like layout for the Display Array (viewBox ~ 1000x360)
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

  // simple grid ops
  clearGrid: () => void
  copyGrid: () => void
  pasteGrid: () => void

  // monitors + presets (MonitorSelector & DisplayArray)
  monitors: Monitor[]
  currentMonitorId: string
  setCurrentMonitor: (id: string) => void

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
  const [assignments, setAssignments] = useState<Assignments>(() => makeEmptyAssignments())
  const [selectedApp, setSelectedApp] = useState<AppId | null>(null)
  const [clipboard, setClipboard] = useState<Assignments | null>(null)

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

  const assignSelected = () => {
    if (!selectedApp) return
    setAssignments((prev) => {
      const next: Assignments = { ...prev }
      selection.forEach((k) => { next[k] = selectedApp })
      return next
    })
  }
  const unassignSelected = () => {
    setAssignments((prev) => {
      const next: Assignments = { ...prev }
      selection.forEach((k) => { next[k] = null })
      return next
    })
  }

  const clearGrid = () => setAssignments(makeEmptyAssignments())
  const copyGrid = () => setClipboard({ ...assignments })
  const pasteGrid = () => clipboard && setAssignments({ ...clipboard })

  /* ---------- Monitors + presets ---------- */
  const [monitors] = useState<Monitor[]>(SAMPLE_MONITORS)
  const [currentMonitorId, setCurrentMonitorId] = useState<string>('m1')
  const setCurrentMonitor = (id: string) => setCurrentMonitorId(id)

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
    setGroupSeed(id)
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

    // monitors + presets
    monitors,
    currentMonitorId,
    setCurrentMonitor,
    presets,
    pendingPresetByMonitor,
    setPendingPreset,
    getPendingPreset,

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
  }), [
    selection, assignments, selectedApp, clipboard,
    monitors, currentMonitorId, presets, pendingPresetByMonitor,
    urlBuilder, browsers
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

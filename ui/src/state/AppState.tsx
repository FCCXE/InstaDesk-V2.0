import React, { createContext, useContext, useMemo, useRef, useState } from 'react'

// Grid size (exported)
export const GRID_ROWS = 6
export const GRID_COLS = 6

// App catalog (exported)
export type AppId = 'outlook' | 'chrome' | 'vscode' | 'notepad' | 'github' | 'stackoverflow'
export type AppInfo = { id: AppId; name: string; color?: string }

export const APPS: Record<AppId, AppInfo> = {
  outlook: { id: 'outlook', name: 'Outlook', color: '#0072c6' },
  chrome: { id: 'chrome', name: 'Chrome', color: '#4285F4' },
  vscode: { id: 'vscode', name: 'VS Code', color: '#22a6f2' },
  notepad: { id: 'notepad', name: 'Notepad', color: '#3e7' },
  github: { id: 'github', name: 'GitHub', color: '#24292e' },
  stackoverflow: { id: 'stackoverflow', name: 'Stack Overflow', color: '#f48024' },
}

// Cell key helper "r,c" (exported)
export type CellKey = string
export const cellKey = (r: number, c: number): CellKey => `${r},${c}`

// Internal helpers
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

// Context surface (exported via hook)
type Modifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
type AppStateContext = {
  selection: Set<CellKey>
  assignments: Assignments
  selectedApp: AppId | null
  clipboard: Assignments | null

  setSelectedApp: (app: AppId | null) => void

  // Drag/select API
  beginDrag: (row: number, col: number, modifiers?: Modifiers) => void
  updateDrag: (row: number, col: number) => void
  endDrag: () => void
  toggleCell: (row: number, col: number) => void
  clearSelection: () => void

  // Assign/Unassign
  assignSelected: () => void
  unassignSelected: () => void

  // Grid ops
  clearGrid: () => void
  copyGrid: () => void
  pasteGrid: () => void
}

const Ctx = createContext<AppStateContext | null>(null)

export const AppStateProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  // Core state
  const [selection, setSelection] = useState<Set<CellKey>>(new Set())
  const [assignments, setAssignments] = useState<Assignments>(() => makeEmptyAssignments())
  const [selectedApp, setSelectedApp] = useState<AppId | null>(null)
  const [clipboard, setClipboard] = useState<Assignments | null>(null)

  // Drag state refs
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ r: number; c: number } | null>(null)
  const additiveRef = useRef(false)
  const baseSelectionRef = useRef<Set<CellKey>>(new Set())

  // Selection/drag operations
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

  // Assign/Unassign
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

  // Grid ops
  const clearGrid = () => setAssignments(makeEmptyAssignments())
  const copyGrid = () => setClipboard({ ...assignments })
  const pasteGrid = () => clipboard && setAssignments({ ...clipboard })

  const value = useMemo<AppStateContext>(() => ({
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
  }), [selection, assignments, selectedApp, clipboard])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState(): AppStateContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

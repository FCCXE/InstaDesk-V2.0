// InstaDesk — propagating a definition change across saved Layouts.
//
// WHY THIS EXISTS. A saved Layout stores a SNAPSHOT of what a definition resolved
// to, not a reference to it: `layoutBuilder.resolveAppTarget` turns a URL group
// into `{program, args, urls}` when the grid becomes assignments, and
// `presets_save` then writes that resolved list into the Layout file. So editing a
// group reached no Layout that already existed. The operator added a fourth URL to
// "News" on 2026-08-27, watched it save correctly, applied the Layout, and got
// three tabs (F-3).
//
// IT CANNOT BE FIXED AT APPLY TIME. `presets_run(kind, slot, margin_px)` is handed
// only the slot — Rust reads the preset file itself and launches from it. The UI
// never sees the assignments on the way past, and Rust cannot read URL groups,
// which live in browser localStorage. So the Layouts must be brought up to date
// when the definition changes.
//
// QUICK PRESETS NEED NOTHING (P-1). A Quick Preset stores only `{kind, slot}`
// references and `quickpresets_run` calls `apply_preset`, reading the Layout file
// fresh. It never holds a copy. The propagation surface is exactly one layer — the
// Layout files — and the whole construct follows from that.
//
// ⛔ THE RULE THAT SHAPES ALL OF THIS (P-3). The obvious implementation is to
// re-resolve every assignment from its definition. That would DESTROY user data.
// The operator's own Layout holds:
//
//     {"title":"VS Code", "program":"…Code.exe", "args":"VsCode 1 - Monitor 3"}
//
// where `args` is a per-cell launch-args override they set by hand — the feature
// that lets two VS Code windows open different folders. Re-resolving would replace
// it with the catalog default and quietly undo their work.
//
//   Propagate ONLY the fields the definition owns.
//   Never write a field the user can set per cell.
//
// For a URL group the definition owns `urls`, and `program` when the browser
// changed. `args`, `monitor`, `grid`, `gridSize` and the window flags belong to the
// user and are never touched.
import type { Assignment } from './api'

/**
 * The parts of an edited DEFINITION that a Layout is allowed to learn about.
 *
 * Both value fields are optional, and **absent means UNCHANGED — never "clear
 * it"**. That is not a convenience: a Favorite resolves differently by kind, so
 * the caller genuinely has only one field to give. `kind: "app"` snapshots
 * `program`; `kind: "url"` snapshots `urls`. Writing `urls: []` into an app
 * assignment because the caller had no URLs would corrupt it, and an empty value
 * that quietly carries two meanings is how data goes missing.
 */
export type DefinitionChange = {
  /** Matched against an assignment's `title`, case-insensitively — the same way
   *  the definition stores match names, so one saved as "news" still reaches a
   *  Layout that recorded "News". */
  name: string
  urls?: string[]
  program?: string
}

/** @deprecated Kept as an alias while callers migrate. */
export type UrlGroupChange = DefinitionChange

export type PropagationResult = {
  /** A NEW array; the input is never mutated, so a dry run and a real write
   *  cannot be confused for one another. */
  assignments: Assignment[]
  /** False when nothing actually differs. A no-op write is not harmless: it
   *  rewrites the user's Layout file for nothing and makes the report claim work
   *  that never happened. */
  changed: boolean
}

const sameList = (a: string[] | undefined, b: string[]): boolean =>
  Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i])

/** Apply a definition change to one Layout's assignments, field-scoped. */
export function applyPropagationToAssignments(
  assignments: Assignment[],
  change: DefinitionChange,
): PropagationResult {
  const target = change.name.trim().toLowerCase()
  let changed = false

  const next = assignments.map(entry => {
    if ((entry.title ?? '').trim().toLowerCase() !== target) return entry

    const urlsDiffer = change.urls !== undefined && !sameList(entry.urls, change.urls)
    const programDiffers = change.program !== undefined && entry.program !== change.program
    if (!urlsDiffer && !programDiffers) return entry

    changed = true
    // Spread first, then overwrite ONLY the fields actually supplied. Every other
    // key — args, monitor, grid, gridSize, activate, topmost,
    // waitReadyMs, singleInstance — survives untouched, including keys added to
    // Assignment after this was written.
    const patched: Assignment = { ...entry }
    if (change.urls !== undefined) patched.urls = [...change.urls]
    if (change.program !== undefined) patched.program = change.program
    return patched
  })

  return { assignments: next, changed }
}

/** One Layout a propagation would touch. */
export type LayoutRef = {
  kind: 'general' | string
  slot: string
  name?: string
  assignments: Assignment[]
}

export type PlannedChange = LayoutRef & { assignments: Assignment[] }

/**
 * DRY RUN. Returns exactly the Layouts that would change, with their patched
 * assignments ready to save — and writes nothing.
 *
 * The caller can therefore show the user what is about to happen, and count it,
 * before a single Layout file is rewritten (invariant U-1: nothing is altered
 * without the user being told).
 */
export function planUrlGroupPropagation(
  layouts: LayoutRef[],
  change: DefinitionChange,
): PlannedChange[] {
  const planned: PlannedChange[] = []
  for (const layout of layouts) {
    const result = applyPropagationToAssignments(layout.assignments, change)
    if (result.changed) planned.push({ ...layout, assignments: result.assignments })
  }
  return planned
}

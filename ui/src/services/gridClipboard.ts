// InstaDesk — the grid clipboard's one rule: same size, or no paste.
//
// Copy takes a monitor's assignments (and its per-cell launch arguments); paste
// puts them on another monitor. The operator's expectation, stated 2026-08-27,
// was that this works "inside any other SAME SIZE grid" — and they were right,
// because the app already depends on that invariant everywhere else:
//
//   - `resizeMonitor` WIPES a monitor's assignments whenever its grid size
//     changes. A grid of one size cannot carry cells from another; that decision
//     predates this feature.
//   - `buildSaveAssignments` iterates every stored cell and skips only the empty
//     ones — it does NOT bound them to the grid size. So a cell at "5,5" pasted
//     onto a 4×4 monitor is invisible on screen, still counted in the totals, and
//     written into a saved Layout as a real grid position. Silent corruption,
//     surfacing later as a window placed somewhere impossible.
//
// A larger target is no safer: the pasted map has no key for the extra cells, so
// the monitor's assignments stop matching the shape `makeEmptyAssignments` builds
// and later code that assumes a full map reads `undefined` where it expects null.
//
// The judgement is a pure function so it can be tested without a React harness.
// The paste itself is three lines of state assignment; this is the part worth
// guarding.
export type GridSize = { cols: number; rows: number }

export type PasteVerdict =
  | { ok: true }
  | { ok: false; reason: 'nothing-copied' | 'size-mismatch'; from: GridSize | null; to: GridSize }

/**
 * May the copied grid be pasted onto a target of this size?
 *
 * Both sizes are returned on refusal so the caller can NAME them. A refusal that
 * does not say what is wrong is the empty-error defect wearing different clothes:
 * the user sees "no" and cannot tell what to change.
 */
export function canPasteGrid(from: GridSize | null, to: GridSize): PasteVerdict {
  if (!from) return { ok: false, reason: 'nothing-copied', from: null, to }
  if (from.cols !== to.cols || from.rows !== to.rows) {
    return { ok: false, reason: 'size-mismatch', from, to }
  }
  return { ok: true }
}

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

/* ────────────────────────────────────────────────────────────────────────────
 * Copying a SELECTION rather than a whole grid.
 *
 * The operator's model, and a better rule than the one above: what must match is
 * the SHAPE OF THE SELECTION, not the size of the monitor. A 3×6 block belongs in
 * any 3×6 selection — on a 6×6, 8×8 or 10×10 grid alike.
 *
 * Cells are stored as offsets from the selection's own bounding box. That is the
 * single decision that makes the target monitor's grid size irrelevant, and it
 * also makes an irregular selection work on the same path at no extra cost.
 * (Irregular selections ARE reachable — Ctrl or Shift + drag a second rectangle
 * and `beginDrag` unions it with the existing one. Nothing in the product says
 * so, which is why they look impossible.)
 * ──────────────────────────────────────────────────────────────────────────── */

/** A copied region: its dimensions, and its contents keyed by offset from the top-left. */
export type GridBlock = {
  rows: number
  cols: number
  /** "dr,dc" -> app title. Only assigned cells appear. */
  cells: Record<string, string>
  /** "dr,dc" -> per-cell launch arguments. */
  args: Record<string, string>
}

const bounds = (keys: Iterable<string>) => {
  let rMin = Infinity, rMax = -Infinity, cMin = Infinity, cMax = -Infinity
  let any = false
  for (const k of keys) {
    const [rs, cs] = k.split(',')
    const r = parseInt(rs, 10), c = parseInt(cs, 10)
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue
    any = true
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    if (c < cMin) cMin = c
    if (c > cMax) cMax = c
  }
  return any ? { rMin, rMax, cMin, cMax, rows: rMax - rMin + 1, cols: cMax - cMin + 1 } : null
}

/** Capture the selected region, relative to its own top-left. */
export function extractBlock(
  selection: Set<string>,
  assignments: Record<string, string | null>,
  argsOverrides: Record<string, string>,
): GridBlock | null {
  const b = bounds(selection)
  if (!b) return null

  const cells: Record<string, string> = {}
  const args: Record<string, string> = {}
  for (const k of selection) {
    const [rs, cs] = k.split(',')
    const off = `${parseInt(rs, 10) - b.rMin},${parseInt(cs, 10) - b.cMin}`
    const app = assignments[k]
    if (app) cells[off] = app
    const a = argsOverrides[k]
    if (a) args[off] = a
  }
  return { rows: b.rows, cols: b.cols, cells, args }
}

export type BlockPastePlan =
  | { ok: true; cells: Record<string, string | null>; args: Record<string, string> }
  | {
      ok: false
      reason: 'no-target-selection' | 'shape-mismatch'
      expected: { rows: number; cols: number }
      got: { rows: number; cols: number } | null
    }

/**
 * Work out what pasting `block` into `targetSelection` would write.
 *
 * Returns the cell writes rather than performing them, so the caller can show or
 * refuse before anything changes — the same dry-run shape as the Layout
 * propagation.
 *
 * Every cell of the target bounding box is written, `null` where the block has
 * nothing. Operator-confirmed: without clearing, paste leaves remnants behind and
 * does not actually mean paste.
 */
export function planBlockPaste(block: GridBlock, targetSelection: Set<string>): BlockPastePlan {
  const expected = { rows: block.rows, cols: block.cols }
  const b = bounds(targetSelection)
  if (!b) return { ok: false, reason: 'no-target-selection', expected, got: null }

  const got = { rows: b.rows, cols: b.cols }
  if (got.rows !== expected.rows || got.cols !== expected.cols) {
    return { ok: false, reason: 'shape-mismatch', expected, got }
  }

  const cells: Record<string, string | null> = {}
  const args: Record<string, string> = {}
  for (let dr = 0; dr < block.rows; dr++) {
    for (let dc = 0; dc < block.cols; dc++) {
      const off = `${dr},${dc}`
      const target = `${b.rMin + dr},${b.cMin + dc}`
      cells[target] = block.cells[off] ?? null
      if (block.args[off]) args[target] = block.args[off]
    }
  }
  return { ok: true, cells, args }
}

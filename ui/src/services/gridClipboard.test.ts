// InstaDesk — the grid clipboard's one rule.
//
// Operator, 2026-08-27: *"I should be able to copy any grid layout, along with its
// assigned apps, and paste it inside any other SAME SIZE grid inside any other
// monitor."* That is exactly right, and the paste shipped earlier that day did not
// enforce it.
//
// Why it matters, measured rather than argued:
//
//   - `buildSaveAssignments` iterates every stored cell and skips only the empty
//     ones. It does NOT bound them to the grid size. So a cell at "5,5" pasted
//     onto a 4×4 monitor is invisible on screen, counted in the totals, and
//     WRITTEN INTO A SAVED LAYOUT as a real grid position.
//   - The app already enforces this rule everywhere else: `resizeMonitor` wipes a
//     monitor's assignments when its grid size changes, precisely because a grid
//     of one size cannot carry cells from another.
//
// The decision is extracted as a pure function so it can be tested without a
// React harness — the paste itself is three lines of state assignment, and the
// part worth guarding is the judgement.
import { describe, it, expect } from 'vitest'
import { canPasteGrid } from './gridClipboard'

const size = (cols: number, rows: number) => ({ cols, rows })

describe('canPasteGrid', () => {
  it('allows a paste between grids of the same size', () => {
    expect(canPasteGrid(size(6, 6), size(6, 6))).toEqual({ ok: true })
  })

  it('refuses when the target grid is SMALLER — cells would land off-grid', () => {
    const r = canPasteGrid(size(6, 6), size(4, 4))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.from).toEqual(size(6, 6))
      expect(r.to).toEqual(size(4, 4))
    }
  })

  it('refuses when the target grid is LARGER — the map would be malformed', () => {
    // Not merely cosmetic: the pasted map has no key for the extra cells, so the
    // monitor's assignments stop matching the shape makeEmptyAssignments builds.
    expect(canPasteGrid(size(4, 4), size(6, 6)).ok).toBe(false)
  })

  it('refuses a non-square mismatch in either dimension alone', () => {
    expect(canPasteGrid(size(6, 6), size(6, 8)).ok).toBe(false)
    expect(canPasteGrid(size(6, 6), size(8, 6)).ok).toBe(false)
  })

  it('refuses when nothing has been copied', () => {
    expect(canPasteGrid(null, size(6, 6)).ok).toBe(false)
  })

  it('reports BOTH sizes when it refuses, so the message can name them', () => {
    // A refusal that does not say what is wrong is the empty-error defect again:
    // the user sees "no" and cannot tell what to change.
    const r = canPasteGrid(size(8, 8), size(6, 6))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(`${r.from!.cols}x${r.from!.rows} -> ${r.to.cols}x${r.to.rows}`).toBe('8x8 -> 6x6')
  })
})

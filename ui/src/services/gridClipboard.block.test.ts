// InstaDesk — copying a SELECTION, not a whole grid.
//
// Operator, 2026-08-27: *"I copy an App assigned to a 3x6 grid array inside
// monitor 1 (configured with a 6x6 grid array), and then I paste the copied array
// into monitor 3 (configured with a 8x8 grid array), the system pastes the 3x6
// copied array seamlessly."*
//
// This REPLACES the same-monitor-grid-size rule added earlier the same day with a
// better one: what must match is the SHAPE OF THE SELECTION, not the size of the
// monitor. A 3×6 block belongs in any 3×6 selection, on a 6×6, 8×8 or 10×10 grid.
//
// Cells are stored as offsets from the selection's bounding box, which is what
// makes the target's own grid size irrelevant — and, incidentally, makes an
// irregular selection work on the same code path. (Irregular selections ARE
// reachable, via Ctrl/Shift+drag of a second rectangle; the operator believed they
// were not, because nothing in the product mentions it.)
import { describe, it, expect } from 'vitest'
import { extractBlock, planBlockPaste } from './gridClipboard'

const sel = (...keys: string[]) => new Set(keys)

describe('extractBlock — copy the selection, relative to its own corner', () => {
  it('measures the block by its bounding box, not by the monitor', () => {
    // A 2-wide × 3-tall selection sitting in the middle of a 6×6 monitor.
    const b = extractBlock(sel('2,1', '2,2', '3,1', '3,2', '4,1', '4,2'), { '2,1': 'Chrome' }, {})
    expect(b).not.toBeNull()
    expect({ rows: b!.rows, cols: b!.cols }).toEqual({ rows: 3, cols: 2 })
  })

  it('stores cells relative to the top-left, so the source position is forgotten', () => {
    // Chrome sits at 2,1 — the block's own origin — so it must land at 0,0.
    const b = extractBlock(sel('2,1', '2,2'), { '2,1': 'Chrome', '2,2': null }, {})
    expect(b!.cells).toEqual({ '0,0': 'Chrome' })
  })

  it('carries the per-cell launch arguments with their cell', () => {
    // The whole point of the args override is that two cells of one app differ.
    const b = extractBlock(sel('2,1', '2,2'), { '2,1': 'VS Code', '2,2': 'VS Code' },
                           { '2,1': 'D:\a', '2,2': 'D:\b' })
    expect(b!.args).toEqual({ '0,0': 'D:\a', '0,1': 'D:\b' })
  })

  it('returns null for an empty selection — there is nothing to copy', () => {
    expect(extractBlock(sel(), {}, {})).toBeNull()
  })

  it('handles an irregular selection on the same path, at no extra cost', () => {
    // Two disjoint cells: bounding box 3×3, only the two cells carried.
    const b = extractBlock(sel('0,0', '2,2'), { '0,0': 'A', '2,2': 'B' }, {})
    expect({ rows: b!.rows, cols: b!.cols }).toEqual({ rows: 3, cols: 3 })
    expect(b!.cells).toEqual({ '0,0': 'A', '2,2': 'B' })
  })
})

describe('planBlockPaste — the target selection must match the block', () => {
  const block = extractBlock(sel('0,0', '0,1', '1,0', '1,1'), { '0,0': 'Chrome', '1,1': 'Slack' }, { '0,0': '--x' })!

  it('pastes into a same-shaped selection ANYWHERE, whatever the monitor grid', () => {
    // The operator's case: the block came from one monitor; this target sits at a
    // different origin, and the monitor is a different size entirely.
    const p = planBlockPaste(block, sel('5,6', '5,7', '6,6', '6,7'))
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.cells).toEqual({ '5,6': 'Chrome', '5,7': null, '6,6': null, '6,7': 'Slack' })
      expect(p.args).toEqual({ '5,6': '--x' })
    }
  })

  it('CLEARS the rest of the target box, so the result matches what was copied', () => {
    // Operator-confirmed. Without this, paste leaves remnants and does not mean
    // paste. The nulls above are that clearing, stated explicitly.
    const p = planBlockPaste(block, sel('0,0', '0,1', '1,0', '1,1'))
    if (p.ok) expect(Object.keys(p.cells).sort()).toEqual(['0,0', '0,1', '1,0', '1,1'])
  })

  it('refuses a differently shaped target, reporting BOTH shapes', () => {
    const p = planBlockPaste(block, sel('0,0', '0,1', '0,2'))
    expect(p.ok).toBe(false)
    if (!p.ok) {
      expect(p.expected).toEqual({ rows: 2, cols: 2 })
      expect(p.got).toEqual({ rows: 1, cols: 3 })
    }
  })

  it('refuses when nothing is selected on the target', () => {
    const p = planBlockPaste(block, sel())
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.reason).toBe('no-target-selection')
  })
})

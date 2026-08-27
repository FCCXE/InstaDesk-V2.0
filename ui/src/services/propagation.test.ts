// InstaDesk — definition propagation (I-9 of the URL Group Editing plan).
//
// A saved Layout stores a SNAPSHOT of what a definition resolved to, not a
// reference to it. So editing a URL group reached no Layout that already existed,
// and the operator saw a fourth URL saved correctly and then not opened (F-3).
//
// Quick Presets need no work: they store only {kind, slot} references and read the
// Layout file fresh at apply time (P-1). Fix the Layouts and the whole construct
// follows.
//
// The dangerous part is P-3. The obvious implementation — "re-resolve every
// assignment from its definition" — would DESTROY user data. The operator's own
// Layout contains {"args":"VsCode 1 - Monitor 3", "title":"VS Code"}: a per-cell
// launch-args override they set by hand, and the very feature that lets two VS
// Code windows open different folders. So propagation is FIELD-SCOPED: it writes
// only what the definition owns, and never a field the user can set per cell.
import { describe, it, expect } from 'vitest'
import { planUrlGroupPropagation, applyPropagationToAssignments } from './propagation'
import type { Assignment } from './api'

const a = (over: Partial<Assignment>): Assignment => ({
  monitor: 1,
  grid: '0,0,2,2',
  gridSize: '6x6',
  ...over,
})

const NEWS_OLD = ['https://www.eltiempo.com/', 'https://edition.cnn.com/']
const NEWS_NEW = ['https://www.eltiempo.com/', 'https://edition.cnn.com/', 'https://new.example/']

describe('I-9 — field-scoped propagation', () => {
  it('refreshes the URLs of a matching assignment', () => {
    const assignments = [a({ title: 'News', program: 'chrome.exe', urls: NEWS_OLD })]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: NEWS_NEW })
    expect(next.changed).toBe(true)
    expect(next.assignments[0].urls).toEqual(NEWS_NEW)
  })

  it('NEVER overwrites a per-cell args override', () => {
    // P-3, stated as a test. This is the assertion that stops the obvious
    // implementation from silently undoing the two-VS-Code-windows feature.
    const assignments = [
      a({ title: 'VS Code', program: 'Code.exe', args: 'VsCode 1 - Monitor 3' }),
      a({ title: 'News', program: 'chrome.exe', args: '--new-window', urls: NEWS_OLD }),
    ]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: NEWS_NEW })

    expect(next.assignments[0].args).toBe('VsCode 1 - Monitor 3')  // untouched
    expect(next.assignments[1].args).toBe('--new-window')          // also untouched
  })

  it('NEVER moves a window: monitor, grid and gridSize are the user territory', () => {
    const assignments = [a({ title: 'News', monitor: 4, grid: '1,2,3,4', gridSize: '8x8', urls: NEWS_OLD })]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: NEWS_NEW })

    expect(next.assignments[0].monitor).toBe(4)
    expect(next.assignments[0].grid).toBe('1,2,3,4')
    expect(next.assignments[0].gridSize).toBe('8x8')
  })

  it('leaves assignments for other definitions alone', () => {
    const assignments = [
      a({ title: 'Entertainment', urls: ['https://youtube.example/'] }),
      a({ title: 'News', urls: NEWS_OLD }),
    ]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: NEWS_NEW })
    expect(next.assignments[0].urls).toEqual(['https://youtube.example/'])
  })

  it('matches the name case-insensitively, as the group lookup does', () => {
    // The definition store matches names case-insensitively; if propagation did
    // not, a group saved as "news" would silently never reach its own Layouts.
    const assignments = [a({ title: 'news', urls: NEWS_OLD })]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: NEWS_NEW })
    expect(next.changed).toBe(true)
    expect(next.assignments[0].urls).toEqual(NEWS_NEW)
  })

  it('updates the browser program when the group changed browser', () => {
    const assignments = [a({ title: 'News', program: 'chrome.exe', urls: NEWS_OLD })]
    const next = applyPropagationToAssignments(assignments, {
      name: 'News', urls: NEWS_NEW, program: 'msedge.exe',
    })
    expect(next.assignments[0].program).toBe('msedge.exe')
  })

  it('leaves the program alone when the caller does not supply one', () => {
    // Absent must mean "unchanged", not "clear it". An empty value that silently
    // means two different things is how data goes missing.
    const assignments = [a({ title: 'News', program: 'chrome.exe', urls: NEWS_OLD })]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: NEWS_NEW })
    expect(next.assignments[0].program).toBe('chrome.exe')
  })

  it('reports NO change when the URLs already match, so nothing is rewritten', () => {
    // A no-op write is not harmless: it rewrites the user's Layout file for
    // nothing, and makes the report claim work that did not happen.
    const assignments = [a({ title: 'News', urls: NEWS_OLD })]
    const next = applyPropagationToAssignments(assignments, { name: 'News', urls: [...NEWS_OLD] })
    expect(next.changed).toBe(false)
  })

  it('does not mutate the array it was given', () => {
    // The caller re-saves on `changed`; a mutated input would make a dry run
    // indistinguishable from a real write.
    const original = [a({ title: 'News', urls: NEWS_OLD })]
    const snapshot = JSON.stringify(original)
    applyPropagationToAssignments(original, { name: 'News', urls: NEWS_NEW })
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

describe('I-9 — the dry run reports without writing', () => {
  const layouts = [
    { kind: 'general' as const, slot: 'A', name: 'Monitor 4 - Basic', assignments: [
      a({ title: 'News', urls: NEWS_OLD }), a({ title: 'VS Code', args: 'VsCode 1 - Monitor 3' }),
    ]},
    { kind: 'general' as const, slot: 'B', name: 'Untouched', assignments: [
      a({ title: 'Entertainment', urls: ['https://youtube.example/'] }),
    ]},
  ]

  it('names exactly the Layouts that would change, and no others', () => {
    const plan = planUrlGroupPropagation(layouts, { name: 'News', urls: NEWS_NEW })
    expect(plan.map(p => p.slot)).toEqual(['A'])
    expect(plan[0].name).toBe('Monitor 4 - Basic')
  })

  it('writes nothing — the input layouts are untouched by planning', () => {
    const snapshot = JSON.stringify(layouts)
    planUrlGroupPropagation(layouts, { name: 'News', urls: NEWS_NEW })
    expect(JSON.stringify(layouts)).toBe(snapshot)
  })

  it('returns an empty plan when no Layout references the group', () => {
    const plan = planUrlGroupPropagation(layouts, { name: 'Nothing Uses This', urls: NEWS_NEW })
    expect(plan).toEqual([])
  })
})

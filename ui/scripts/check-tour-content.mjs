// InstaDesk — walkthrough CONTENT gate.
//
//   node scripts/check-tour-content.mjs        (run from ui/)
//
// The other three gates verify STRUCTURE: that anchors exist, that locale keys
// match, that no forbidden call is made. None of them verifies that the prose is
// TRUE — and for a walkthrough, truthfulness is the whole product.
//
// This exists because that failed in practice. The first draft of the chapters
// told users "a 2x2 gives you four big regions" and "a small laptop screen is
// easier at 3x2". InstaDesk offers neither: the real options are 4x4, 6x6, 8x8
// and 10x10. Every gate was green. The operator caught it by reading the screen.
//
// Not every factual claim is machine-checkable, and this does not pretend
// otherwise. It checks the claims that ARE: any NxN grid size the prose names
// must actually be one the app offers. Narrow, but it makes a recurrence of the
// exact defect that occurred impossible rather than merely unlikely.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')
const CHAPTERS = resolve(SRC, 'tour/chapters.ts')
const APPSTATE = resolve(SRC, 'state/AppState.tsx')

const problems = []

// ---- the grid sizes the app ACTUALLY offers, read from the source of truth --
const appState = readFileSync(APPSTATE, 'utf8')
const presetBlock = appState.match(/GRID_SIZE_PRESETS[^=]*=\s*\[([\s\S]*?)\]/)
if (!presetBlock) {
  console.error('tour content: FAIL — could not locate GRID_SIZE_PRESETS in AppState.tsx')
  process.exit(1)
}
const offered = new Set(
  [...presetBlock[1].matchAll(/cols:\s*(\d+)\s*,\s*rows:\s*(\d+)/g)].map((m) => `${m[1]}x${m[2]}`),
)
if (offered.size === 0) {
  console.error('tour content: FAIL — GRID_SIZE_PRESETS parsed to zero entries; the check would be vacuous')
  process.exit(1)
}

// ---- every grid size the prose names must be one of them -------------------
const chapters = readFileSync(CHAPTERS, 'utf8')
const lines = chapters.split('\n')
// Accept both the ASCII "4x4" and the multiplication sign "4×4" used in the UI.
const CLAIM = /(\d{1,2})\s*[x×]\s*(\d{1,2})/g

lines.forEach((line, i) => {
  // Only prose, not code: skip comment lines so the explanation above a rule
  // cannot itself trip the rule.
  const t = line.trim()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
  for (const m of line.matchAll(CLAIM)) {
    const claim = `${m[1]}x${m[2]}`
    if (!offered.has(claim)) {
      problems.push(
        `chapters.ts:${i + 1} names grid size "${m[1]}×${m[2]}", which InstaDesk does not offer. ` +
          `Available: ${[...offered].join(', ')}`,
      )
    }
  }
})

// ---- every chapter and step must have its text, in en.json ----------------
// chapters.ts holds structure only; the words resolve by convention. A missing
// key does not crash — i18next renders the raw key path — so the user would see
// "tour.chapters.grid.steps.grid-status.title" in the middle of a walkthrough.
// Visible, but only to whoever happens to run that chapter.
const EN = JSON.parse(readFileSync(resolve(SRC, 'i18n/locales/en.json'), 'utf8'))
const at = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), EN)

const chapterIds = [...chapters.matchAll(/id:\s*'([a-zA-Z0-9_-]+)'/g)].map((m) => m[1])
if (chapterIds.length === 0) {
  console.error('tour content: FAIL — no chapters parsed; the check would be vacuous')
  process.exit(1)
}

// Steps are grouped per chapter by walking the file in order.
const blocks = chapters.split(/id:\s*'/).slice(1)
for (const [i, id] of chapterIds.entries()) {
  if (typeof at(`tour.chapters.${id}.title`) !== 'string') {
    problems.push(`chapter "${id}" has no tour.chapters.${id}.title`)
  }
  const anchorsInBlock = [...blocks[i].matchAll(/anchor:\s*'([a-zA-Z0-9_-]+)'/g)].map((m) => m[1])
  const seen = new Set()
  for (const a of anchorsInBlock) {
    if (seen.has(a)) {
      problems.push(`chapter "${id}" uses anchor "${a}" twice — its text keys would collide`)
    }
    seen.add(a)
    for (const part of ['title', 'body']) {
      if (typeof at(`tour.chapters.${id}.steps.${a}.${part}`) !== 'string') {
        problems.push(`step "${id}/${a}" has no tour.chapters.${id}.steps.${a}.${part}`)
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`tour content: FAIL — ${problems.length} problem(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nA walkthrough that states something the app does not do is worse than no')
  console.error('walkthrough: the user trusts it, and then it is wrong.')
  process.exit(1)
}

console.log(
  `tour content: OK — ${chapterIds.length} chapters have text in en.json; ` +
    `grid-size claims check out against ${offered.size} offered sizes`,
)

// InstaDesk — walkthrough anchor gate.
//
//   node scripts/check-tour-anchors.mjs        (run from ui/)
//
// Keeps src/tour/anchors.json and the data-tour attributes in the components
// from drifting apart. Wired into `checks` -> `prebuild`, so it runs in the
// local UI gate, the Sandbox build and the release robot.
//
// WHY BOTH DIRECTIONS
// A one-way check rots. If it only verified that registered anchors exist, an
// unregistered attribute could be added and no engine would know how to reach
// it. If it only verified that attributes are registered, a registry entry
// could name an anchor nobody ever added, and the step pointing at it would
// silently find nothing at runtime. Both directions, or neither is worth much.
//
// WHY component IS CHECKED, NOT JUST EXISTENCE
// An anchor moved from one component to another still "exists", so an
// existence-only check stays green while reachableWhen silently becomes a lie —
// the registry would claim it lives behind the Settings tab when it now sits in
// the bottom bar. The gate therefore asserts WHERE it is, not merely THAT it is.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')
const REGISTRY = resolve(SRC, 'tour/anchors.json')

const VALID_TABS = ['Apps', 'Layouts', 'Settings', 'Help']
const VALID_SUBS = ['URLs', 'Apps', 'Favorites']

const BACKSLASH = String.fromCharCode(92)
const rel = (p) => relative(SRC, p).split(BACKSLASH).join('/')

const problems = []

// ---- 1. load + shape-validate the registry -------------------------------
let anchors = []
try {
  const parsed = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  if (!Array.isArray(parsed.anchors)) {
    console.error('tour anchors: FAIL — anchors.json: "anchors" must be an array')
    process.exit(1)
  }
  anchors = parsed.anchors
} catch (e) {
  console.error(`tour anchors: FAIL — cannot read/parse ${rel(REGISTRY)}: ${e.message}`)
  process.exit(1)
}

const seenIds = new Set()
for (const [i, a] of anchors.entries()) {
  const at = `anchors[${i}]${a && a.id ? ` (${a.id})` : ''}`
  if (!a || typeof a !== 'object') {
    problems.push(`${at}: not an object`)
    continue
  }
  for (const f of ['id', 'component', 'describes']) {
    if (typeof a[f] !== 'string' || !a[f].trim()) problems.push(`${at}: missing/empty "${f}"`)
  }
  if (typeof a.id === 'string') {
    if (!/^[a-z0-9-]+$/.test(a.id)) problems.push(`${at}: id must be kebab-case [a-z0-9-]`)
    if (seenIds.has(a.id)) problems.push(`${at}: duplicate id "${a.id}"`)
    seenIds.add(a.id)
  }
  const r = a.reachableWhen
  if (!r || typeof r !== 'object') {
    problems.push(`${at}: missing "reachableWhen" — without it a null lookup is undiagnosable (F-4)`)
  } else if (r.kind === 'always') {
    /* ok */
  } else if (r.kind === 'tab') {
    if (!VALID_TABS.includes(r.tab)) problems.push(`${at}: reachableWhen.tab must be one of ${VALID_TABS.join('|')}`)
  } else if (r.kind === 'tab+sub') {
    if (r.tab !== 'Apps') problems.push(`${at}: reachableWhen.tab must be "Apps" for kind "tab+sub"`)
    if (!VALID_SUBS.includes(r.sub)) problems.push(`${at}: reachableWhen.sub must be one of ${VALID_SUBS.join('|')}`)
  } else {
    problems.push(`${at}: reachableWhen.kind "${r.kind}" is not a known kind`)
  }
}

// ---- 2. scan source for data-tour attributes -----------------------------
function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

// Only STRING-LITERAL anchors are verifiable. `data-tour={someVar}` cannot be
// checked at build time, so the literal must appear at the call site instead:
// a shared component (e.g. RightPane's TopTab) takes a `tourId="…"` prop and
// forwards it. Both literal forms are recognised here.
const ATTR = /(?:data-tour|tourId)\s*=\s*"([a-z0-9-]+)"/g

// Dynamic forwarding is a hole in the gate, so it is allow-listed rather than
// tolerated. A file that forwards `data-tour={…}` must be named here; anywhere
// else it is a way to smuggle in an unregistered, unverifiable anchor.
const DYNAMIC = /data-tour\s*=\s*\{/g
const DYNAMIC_FORWARDERS = new Set(['components/RightPane.tsx'])

// A walkthrough STEP names an anchor too. The engine catches an unregistered
// one at runtime and says so plainly, but runtime detection is the safety net,
// not the gate: a step pointing at a bogus anchor should never reach a build.
const STEP_ANCHOR = /\banchor\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/g

// DevTourLauncher deliberately contains a broken step, because REQ-1 is signed
// off by demonstrating that the exit survives one. It is dev-only and renders
// nothing in production, so it is exempt - named explicitly rather than
// pattern-matched, so a second exemption cannot appear by accident.
const STEP_ANCHOR_EXEMPT = new Set(['tour/DevTourLauncher.tsx'])

const files = walk(SRC)
const found = new Map() // id -> [{file, line}]
const fileLines = new Map() // relative path -> string[], kept for the per-row check
const stepAnchors = [] // {id, file, line} — anchors named by walkthrough STEPS
for (const file of files) {
  const r = rel(file)
  const lines = readFileSync(file, 'utf8').split('\n')
  fileLines.set(r, lines)
  lines.forEach((line, i) => {
    for (const m of line.matchAll(ATTR)) {
      const id = m[1]
      if (!found.has(id)) found.set(id, [])
      found.get(id).push({ file: r, line: i + 1 })
    }
    if (!STEP_ANCHOR_EXEMPT.has(r)) {
      for (const m of line.matchAll(STEP_ANCHOR)) {
        stepAnchors.push({ id: m[1], file: r, line: i + 1 })
      }
    }
    if (DYNAMIC.test(line) && !DYNAMIC_FORWARDERS.has(r)) {
      problems.push(
        `dynamic anchor at src/${r}:${i + 1} — data-tour={…} cannot be verified at build time. ` +
          `Pass a literal tourId="…" from the call site, or allow-list this file as a forwarder.`,
      )
    }
    DYNAMIC.lastIndex = 0
  })
}

// ---- 3. direction A: every registered anchor exists, in the named file ----
for (const a of anchors) {
  if (typeof a?.id !== 'string') continue
  const hits = found.get(a.id)
  if (!hits || hits.length === 0) {
    problems.push(`registered but NOT IN SOURCE: "${a.id}" (registry says ${a.component})`)
    continue
  }
  if (hits.length > 1) {
    problems.push(
      `"${a.id}" appears ${hits.length} times: ${hits.map((h) => `${h.file}:${h.line}`).join(', ')} — ids must be unique in the DOM`,
    )
  }
  const want = String(a.component).replace(/^(\.\/)?(ui\/)?(src\/)?/, '')
  if (!hits.some((h) => h.file === want)) {
    problems.push(
      `"${a.id}" moved: registry says src/${want}, found at ${hits.map((h) => `src/${h.file}`).join(', ')} — reachableWhen is now unverified`,
    )
  }
}

// ---- 3c. a per-row anchor cannot promise unconditional reachability ------
//
// Added 2026-08-27, after the operator walked the tour and met:
//   "favorites-row-actions" could not be found where it is registered.
//
// It was registered `tab+sub` and placed inside `favorites.map(...)`, so with an
// empty Favorites list the step arrived with nothing to point at. The engine
// reported honestly rather than highlighting thin air — but a step that only
// works once the user happens to own the right data is not taught, it is gambled
// on.
//
// This is F-4 again, and every existing check passed: the anchor genuinely WAS in
// the source, in the file the registry named. Existence is not reachability.
// `always` and `tab+sub` both promise "open the right pane and it is there", and
// an element rendered once per item cannot keep that promise.
for (const a of anchors) {
  const kind = a?.reachableWhen?.kind
  if (kind !== 'always' && kind !== 'tab+sub') continue
  for (const h of found.get(a.id) ?? []) {
    const lines = fileLines.get(h.file)
    if (!lines) continue
    // Walk the ENCLOSING BLOCKS by indentation, not merely backwards through the
    // file. The first version scanned back for any `.map(` within 60 lines and
    // flagged three anchors that are plainly always rendered — `favorites-add`
    // sits in the pane header, above the list entirely. A check that cries wolf
    // gets switched off, which is worse than not having it.
    //
    // Each step up takes the nearest preceding line indented LESS than the
    // current threshold: that is the construct containing us. If any of those
    // ancestors opens a `.map(`, this element is emitted per item.
    const indentOf = (s) => (s.match(/^\s*/) || [''])[0].length
    let threshold = indentOf(lines[h.line - 1])
    let insideMap = false
    for (let i = h.line - 2; i >= 0 && threshold > 0; i--) {
      const line = lines[i]
      if (!line.trim()) continue
      const ind = indentOf(line)
      if (ind >= threshold) continue
      if (/\.map\s*\(/.test(line)) { insideMap = true; break }
      threshold = ind
    }
    if (insideMap) {
      problems.push(
        `"${a.id}" sits inside a .map() at src/${h.file}:${h.line} but declares reachableWhen ` +
          `"${kind}" — a per-row element is ABSENT when the list is empty (F-4). Anchor something ` +
          `always rendered, or model the data dependency.`,
      )
    }
  }
}

// ---- 3b. every anchor a STEP names must be registered --------------------
for (const s of stepAnchors) {
  if (!seenIds.has(s.id)) {
    problems.push(
      `step names an UNREGISTERED anchor "${s.id}" at src/${s.file}:${s.line} — ` +
        `the engine would report this at runtime; it must not reach a build`,
    )
  }
}

// ---- 4. direction B: every attribute in source is registered -------------
for (const [id, hits] of found) {
  if (!seenIds.has(id)) {
    problems.push(`IN SOURCE but NOT REGISTERED: "${id}" at ${hits.map((h) => `src/${h.file}:${h.line}`).join(', ')}`)
  }
}

// ---- report ---------------------------------------------------------------
if (problems.length > 0) {
  console.error(
    `tour anchors: FAIL — ${problems.length} problem(s) · ${anchors.length} registered · ${found.size} in source`,
  )
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nThe registry and the components must agree in BOTH directions.')
  console.error('An unregistered anchor has no reachableWhen, so a null lookup at runtime')
  console.error('cannot be told apart from "the pane is not open yet" (finding F-4).')
  process.exit(1)
}

if (anchors.length === 0 && found.size === 0) {
  // Say it loudly: a pass over nothing is not evidence. I-5 must see this change.
  console.log('tour anchors: 0 registered, 0 in source — NOTHING WAS CHECKED (I-5 populates this)')
} else {
  console.log(`tour anchors: OK — ${anchors.length} registered, ${found.size} in source, ${stepAnchors.length} step reference(s), all agree`)
}

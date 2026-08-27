// InstaDesk — wiring audit. NOT a gate; an instrument you run on purpose.
//
//   node scripts/audit-wiring.mjs            (run from ui/)
//   node scripts/audit-wiring.mjs --json     (machine-readable)
//
// Looks for features that EXIST but are not WIRED — the class the operator found
// by hand on 2026-08-27: the URL Builder's "Open behaviour" radios were read by
// their own checkboxes, written by a setter, and consumed by nothing. The app
// always opened one window. Help and the Guided Tour both documented the choice.
//
// The shape is always the same: something is WRITTEN and never READ by anything
// that acts on it. That is measurable, so it is measured here rather than argued.
//
// FOUR PROBES, each independently fallible, which is why there are four:
//
//   A. Dead exports        — an exported symbol nothing imports or calls.
//                            This is how `updateFavorite` was found: it exists,
//                            it works, and no UI can reach it.
//   B. Unconsumed state    — a key on the AppState context that no component
//                            outside AppState.tsx ever reads. A control that
//                            only feeds its own `checked=` is exactly this.
//   C. Orphan strings      — an i18n key no `t()` call references. Usually the
//                            label of a control that was removed or never wired.
//   D. Unreachable commands— a Tauri command registered in Rust that the UI's
//                            api layer never invokes.
//
// ⚠ EVERY PROBE OVER-REPORTS BY DESIGN. Dynamic references (`t(\`help.${id}\`)`),
// re-exports, and type-only symbols all look dead to a text scan. A hit is a
// CANDIDATE to go and read, never a verdict. Reporting a candidate as a defect
// without opening the file is how an audit manufactures work.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')
const LIB_RS = resolve(here, '../../src-tauri/src/lib.rs')
const JSON_OUT = process.argv.includes('--json')

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const files = walk(SRC).filter(f => !/\.test\.tsx?$/.test(f))
const text = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))
const rel = f => relative(SRC, f).replace(/\\/g, '/')

/** Occurrences of a bare identifier across every file except the ones excluded. */
function usesOf(name, exclude = new Set()) {
  const re = new RegExp(`\\b${name}\\b`, 'g')
  const hits = []
  for (const [file, src] of text) {
    if (exclude.has(file)) continue
    const n = (src.match(re) || []).length
    if (n > 0) hits.push({ file: rel(file), n })
  }
  return hits
}

/* ── A. Dead exports ─────────────────────────────────────────────────────── */
const deadExports = []
for (const [file, src] of text) {
  const re = /^export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/gm
  let m
  while ((m = re.exec(src)) !== null) {
    const name = m[1]
    const elsewhere = usesOf(name, new Set([file]))
    if (elsewhere.length === 0) {
      const line = src.slice(0, m.index).split('\n').length
      deadExports.push({ symbol: name, at: `src/${rel(file)}:${line}` })
    }
  }
}

/* ── B. State that nothing ACTS on ───────────────────────────────────────── */
//
// ⚠ THE FIRST VERSION OF THIS PROBE FAILED ITS OWN CONTROL, and the failure is
// the reason it is written this way. It asked "does any component reference this
// member?" — and for the dead `openMode` the answer was YES: `setOpenMode` really
// was called by the radio's onChange, and `openMode` really was read by
// `checked={urlBuilder.openMode === "single"}`. Run against the commit where the
// defect was still live, the probe reported nothing. Had it been trusted, the
// audit would have certified the very defect it exists to find.
//
// Reachability is not consumption. The right question is whether the value ever
// reaches something that ACTS: persistence, a backend call, or any read that is
// not simply the control rendering its own state back to itself.
const appState = [...text.keys()].find(f => /state[\\/]AppState\.tsx$/.test(f))
const unconsumedState = []
/** Setters whose field name could not be derived — NOT findings, just blind spots. */
const underivable = []

/** A line that only feeds a control's own display: `checked={x === 'a'}`,
 *  `value={x}`, `selected={…}`. Rendering your own state is not consuming it. */
const SELF_RENDER = /\b(checked|value|defaultValue|selected|aria-checked)\s*=\s*\{/
/** A line where the value genuinely goes somewhere that acts. */
const ACTS = /\b(api\s*\.|invoke\s*[<(]|safeSet|localStorage\s*\.|JSON\.stringify|presetsSave|addUrlGroup|updateUrlGroup)/

// ⚠ AND THE SECOND VERSION FAILED THE SAME CONTROL, for a different reason:
// `openMode` was never a member of the context at all. It lived NESTED inside
// `urlBuilder` (a UrlBuilderDraft), so a scan of context members could not see it
// however cleverly it classified reads. Two probes in a row reported a clean bill
// of health on a codebase with a known dead control in it.
//
// So start from the WRITE PATH instead: every `setX` on the context is a promise
// that some `x` is worth remembering. Derive the field from the setter and ask
// what ever reads it. That reaches nested fields, because it never needed the
// field to be declared at the top level in the first place.
if (appState) {
  const src = text.get(appState)
  const block = /type\s+AppStateContext\s*=\s*\{([\s\S]*?)\n\}/.exec(src)
  if (block) {
    // ⚠ AND THE THIRD VERSION LOST WHAT THE FIRST ONE CAUGHT. Pivoting to the
    // write path fixed nested fields and silently stopped examining every member
    // that is NOT a setter — which is how `copyGrid` / `pasteGrid` slipped
    // through: declared on the context, implemented, exposed, and referenced by
    // no component anywhere. Version 1 flagged them; version 3 never looked.
    // A fix that narrows what a check SEES is a regression even when every test
    // still passes. Both paths now run.
    const members = [...block[1].matchAll(/^  ([A-Za-z_$][\w$]*)\s*[?]?\s*:/gm)].map(x => x[1])
    for (const name of new Set(members)) {
      if (/^set[A-Z]/.test(name)) continue          // covered by the setter path
      const re = new RegExp(`\\b${name}\\b`)
      let seen = false
      for (const [file, body] of text) {
        if (file === appState) continue
        if (re.test(body)) { seen = true; break }
      }
      if (!seen) unconsumedState.push({ member: name, why: 'on the context, and no component references it' })
    }

    const setters = [...block[1].matchAll(/^\s*(set[A-Z][\w$]*)\s*[?]?\s*:/gm)].map(x => x[1])
    for (const setter of new Set(setters)) {
      const field = setter[3].toLowerCase() + setter.slice(4)   // setOpenMode -> openMode
      const re = new RegExp(`\\b${field}\\b`)

      // The setter name does not always match the field it writes: `setUrlBrowser`
      // writes `browser`, `setGridSizeForMonitor` writes `gridSizeByMonitor`. When
      // the derived name appears nowhere in AppState, the derivation FAILED — and
      // "I could not analyse this" must never be reported as "this is dead". That
      // distinction is the difference between an audit and a pile of noise.
      if (!re.test(src)) { underivable.push({ setter, guessed: field }); continue }
      // An object-literal key or an assignment is a WRITE, not a read. Without
      // this every initialiser would look like consumption.
      const isWrite = new RegExp(`\\b${field}\\s*[:=]`)

      let selfRender = 0
      let realReads = 0
      for (const [, body] of text) {
        for (const line of body.split('\n')) {
          if (!re.test(line)) continue
          if (isWrite.test(line)) continue
          if (SELF_RENDER.test(line)) { selfRender++; continue }
          realReads++
        }
      }
      const persisted = src.split('\n').some(line => re.test(line) && ACTS.test(line))

      if (realReads === 0 && !persisted) {
        unconsumedState.push({
          member: `${field} (via ${setter})`,
          why: selfRender > 0
            ? `only ever read to render its own control (${selfRender}x) — nothing acts on it`
            : 'written, and never read by anything',
        })
      }
    }
  }
}

/* ── C. Orphan i18n keys ─────────────────────────────────────────────────── */
const en = JSON.parse(readFileSync(resolve(SRC, 'i18n/locales/en.json'), 'utf8'))
const leaves = []
;(function collect(node, path = '') {
  for (const [k, v] of Object.entries(node)) {
    const p = path ? `${path}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) collect(v, p)
    else leaves.push(p)
  }
})(en)

const allSource = [...text.values()].join('\n')
const orphanStrings = leaves.filter(key => {
  if (allSource.includes(`"${key}"`) || allSource.includes(`'${key}'`)) return false
  // i18next plural suffixes: the code says t("urls.saved"), the file holds
  // urls.saved_one / _other. Treat the base key as the reference.
  const base = key.replace(/_(one|other|zero|two|few|many)$/, '')
  if (base !== key && (allSource.includes(`"${base}"`) || allSource.includes(`'${base}'`))) return false
  // Dynamically composed keys — `help.sections.${id}.title` and friends. If any
  // ancestor path appears in a template literal, assume reachable and say so.
  const parts = key.split('.')
  for (let i = parts.length - 1; i > 0; i--) {
    if (allSource.includes(parts.slice(0, i).join('.') + '.')) return false
  }
  return true
})

/* ── D. Rust commands the UI never invokes ───────────────────────────────── */
let unreachableCommands = []
try {
  const libRs = readFileSync(LIB_RS, 'utf8')
  const handler = /invoke_handler\s*\(\s*tauri::generate_handler!\s*\[([\s\S]*?)\]/.exec(libRs)
  if (handler) {
    const registered = [...handler[1].matchAll(/([A-Za-z_][\w]*)\s*(?:,|$)/g)]
      .map(x => x[1])
      .filter(n => !['backend', 'license', 'crate'].includes(n))
    unreachableCommands = [...new Set(registered)].filter(
      cmd => !allSource.includes(`'${cmd}'`) && !allSource.includes(`"${cmd}"`),
    )
  }
} catch { /* lib.rs unreadable — probe D simply reports nothing */ }

/* ── Report ──────────────────────────────────────────────────────────────── */
const report = { deadExports, unconsumedState, orphanStrings, unreachableCommands, underivable }

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const section = (title, rows, fmt) => {
    console.log(`\n${title}: ${rows.length}`)
    for (const r of rows) console.log(`  - ${fmt(r)}`)
  }
  console.log('InstaDesk wiring audit — candidates, NOT verdicts. Open each file before believing it.')
  section('A. Exported but never used elsewhere', deadExports, r => `${r.symbol}  (${r.at})`)
  section('B. State nothing ACTS on', unconsumedState, r => `${r.member} — ${r.why}`)
  section('C. i18n keys no t() call references', orphanStrings, r => r)
  section('D. Rust commands the api layer never invokes', unreachableCommands, r => r)
  section('BLIND SPOT — setter whose field could not be derived (not a finding)', underivable,
          r => `${r.setter} (guessed "${r.guessed}", not found)`)
  const total = deadExports.length + unconsumedState.length + orphanStrings.length + unreachableCommands.length
  console.log(`\ntotal candidates: ${total}  (across ${files.length} source files)`)
}

// InstaDesk — React state-updater purity gate.
//
//   node scripts/check-updater-purity.mjs        (run from ui/)
//
// Fails the build if a side effect is performed INSIDE a functional state
// updater — `setX(prev => { ...effect... })`.
//
// Why this exists. React re-invokes updater functions under StrictMode, and
// during concurrent re-renders, deliberately: an updater is required to be pure
// so React may call it as often as it likes. A side effect inside one therefore
// runs an unpredictable number of times. v0.4.0 shipped exactly that defect —
// an emit inside `setIndex` fired twice under StrictMode and reported both
// `tour_completed` and `tour_abandoned` for a single tour. It was found by
// reading a log, not by any gate.
//
// This programme adds a second emit on a destructive action, so the defect class
// is live again and now has a mechanism instead of a sentence.
//
// Scope note: this checks the UPDATER FORM only — `setX(value)` is not an updater
// and is not scanned. That is the narrow, checkable thing. Effects called from
// event handlers or useEffect are legitimate and deliberately untouched.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')

/** Calls that are observable outside the updater. Not exhaustive by intent —
 *  these are the ones this app can actually perform. */
const FORBIDDEN = [
  { re: /\btrack\s*\(/, why: 'telemetry emit — updaters may run more than once' },
  { re: /\bcaptureError\s*\(/, why: 'error report — updaters may run more than once' },
  { re: /\bidentifyInstall\s*\(/, why: 'telemetry identify — updaters may run more than once' },
  { re: /\bapi\s*\.\s*[A-Za-z_]/, why: 'backend call — updaters may run more than once' },
  { re: /\binvoke\s*[<(]/, why: 'Tauri call — updaters may run more than once' },
  { re: /\blocalStorage\s*\./, why: 'persistence — updaters may run more than once' },
]

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
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

/** Text of the argument list of the call starting at `open` (index of the `(`),
 *  found by paren balancing so nested calls do not truncate it. Strings are
 *  skipped so a bracket inside a message cannot unbalance the scan. */
function argText(src, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return ''
}

const files = walk(SRC)
const problems = []
let updatersScanned = 0

for (const file of files) {
  const rel = relative(SRC, file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const call = /\bset[A-Z]\w*\s*\(/g
  let m
  while ((m = call.exec(src)) !== null) {
    const open = m.index + m[0].length - 1
    const args = argText(src, open)
    // Updater form only: the argument must itself be a function.
    const isUpdater = /^\s*(\(?\s*[A-Za-z_$][\w$]*\s*\)?|\(\s*\))\s*=>/.test(args)
    if (!isUpdater) continue
    updatersScanned++
    const line = src.slice(0, m.index).split('\n').length
    for (const { re, why } of FORBIDDEN) {
      if (re.test(args)) {
        problems.push(`src/${rel}:${line}  ${m[0].slice(0, -1)}(…) — ${why}`)
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`updater purity: FAIL — ${problems.length} side effect(s) inside state updaters`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nReact may call an updater more than once. Move the effect to the')
  console.error('event handler or an effect, and keep the updater a pure function of prev.')
  process.exit(1)
}

if (updatersScanned === 0) {
  // Say it loudly: a pass over nothing is not evidence that anything is pure.
  console.log(`updater purity: 0 functional updaters found across ${files.length} file(s) — NOTHING WAS CHECKED`)
} else {
  console.log(`updater purity: OK — ${updatersScanned} functional updater(s) across ${files.length} file(s), ${FORBIDDEN.length} effect kinds`)
}

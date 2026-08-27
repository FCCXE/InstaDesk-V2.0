// InstaDesk - layout yield gate.
//
//   node scripts/check-layout-yield.mjs        (run from ui/)
//
// Fails the build if a control with a HARD minimum width sits inside a flex row
// that cannot wrap. Wired into `checks` -> `prebuild`.
//
// Why this exists. Twice now the operator has photographed a Spanish label
// bursting out of its container, and both times the cause was the same shape: a
// row whose children BOTH refuse to yield, sized to within a few pixels of the
// budget in the longest locale.
//
//   2026-08-26  the bottom bar   - h-12 fixed, Spanish labels 13 chars longer
//   2026-08-26  Settings         - select min-w-[160px] + "Tamano de cuadricula
//                                  predeterminado" against a 268px column
//
// WHY THIS IS A STRUCTURAL RULE AND NOT AN ARITHMETIC ONE. The obvious gate is to
// add the widths up and compare against the column. That gate was written first
// and it PASSED the live defect: floor 160 + longest Spanish word 14 chars at an
// assumed 7.2px/char = 261px against a 268px budget, reported as "fits by 7px",
// while the operator's screenshot showed it overflowing. The character-width
// constant is a guess, so the sum lands in the reassuring direction - the exact
// failure the handbook names. A gate that cannot be trusted to fail is worse than
// no gate, because it is read as evidence.
//
// So the rule here is a yes/no property that needs no measurement: if a control
// declares a hard floor, the row holding it must be ALLOWED TO WRAP. Then the
// budget stops binding at any label length, in any language, forever.
//
// Scope: this finds the floors and resolves the row that encloses them, including
// through a component indirection (<Row> -> function Row). It does NOT reason
// about widths, and claims nothing about rows with no declared floor.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')

const FLOOR = /min-w-\[(\d+)px\]/

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(full)) out.push(full)
  }
  return out
}

/** End index of the JSX tag opening at `i`, skipping strings and {expressions}.
 *  Brace tracking is required: an arrow function in an attribute (onChange={(e)
 *  => ...}) contains a '>' that would otherwise end the tag early. */
function tagEnd(src, i) {
  let k = i, depth = 0, quote = null
  while (k < src.length) {
    const c = src[k]
    if (quote) {
      if (c === '\\') { k += 2; continue }
      if (c === quote) quote = null
      k++; continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; k++; continue }
    if (c === '{') { depth++; k++; continue }
    if (c === '}') { depth--; k++; continue }
    if (depth === 0 && c === '/' && src[k + 1] === '>') return { end: k + 2, selfClosing: true }
    if (depth === 0 && c === '>') return { end: k + 1, selfClosing: false }
    k++
  }
  return { end: src.length, selfClosing: true }
}

/** className of the outermost element a local component renders, so <Row> can be
 *  resolved to the div it actually produces. */
function componentClass(src, name) {
  const at = src.indexOf(`function ${name}(`)
  if (at < 0) return null
  const m = /className\s*=\s*"([^"]*)"/.exec(src.slice(at, at + 900))
  return m ? m[1] : null
}

const files = walk(SRC)
const problems = []
let floors = 0

for (const file of files) {
  const rel = relative(SRC, file).replace(/\\/g, '/')
  const src = readFileSync(file, 'utf8')
  const stack = []
  let i = 0
  while (i < src.length) {
    if (src[i] !== '<') { i++; continue }
    if (src[i + 1] === '/') {
      const gt = src.indexOf('>', i)
      stack.pop()
      i = (gt < 0 ? src.length : gt + 1)
      continue
    }
    const m = /^<([A-Za-z_][\w.]*)/.exec(src.slice(i, i + 64))
    if (!m) { i++; continue }
    const { end, selfClosing } = tagEnd(src, i + m[0].length)
    const attrs = src.slice(i, end)

    if (FLOOR.test(attrs)) {
      floors++
      const line = src.slice(0, i).split('\n').length
      const parent = stack[stack.length - 1]
      if (!parent) {
        problems.push(`src/${rel}:${line}  ${m[1]} has ${FLOOR.exec(attrs)[0]} at top level - no enclosing row found`)
      } else {
        const cls = /^[A-Z]/.test(parent.name)
          ? componentClass(src, parent.name)
          : (/className\s*=\s*"([^"]*)"/.exec(parent.attrs) || [])[1]
        const via = /^[A-Z]/.test(parent.name) ? ` (via <${parent.name}>)` : ''
        if (cls == null) {
          problems.push(`src/${rel}:${line}  ${FLOOR.exec(attrs)[0]} inside <${parent.name}>${via} - cannot resolve its className`)
        } else if (/\bflex\b/.test(cls) && !/flex-wrap/.test(cls) && !/flex-col/.test(cls)) {
          problems.push(`src/${rel}:${line}  ${FLOOR.exec(attrs)[0]} inside a non-wrapping flex row${via} - the row cannot yield, so a long label overflows it`)
        }
      }
    }
    if (!selfClosing) stack.push({ name: m[1], attrs })
    i = end
  }
}

if (problems.length > 0) {
  console.error(`layout yield: FAIL - ${problems.length} non-yielding row(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nA control with a hard min-width inside a row that cannot wrap will')
  console.error('overflow at some label length. Add flex-wrap to the row, not pixels.')
  process.exit(1)
}

if (floors === 0) {
  console.log(`layout yield: 0 hard min-width floors found across ${files.length} file(s) - NOTHING WAS CHECKED`)
} else {
  console.log(`layout yield: OK - ${floors} hard min-width floor(s) across ${files.length} file(s), every enclosing row can wrap`)
}

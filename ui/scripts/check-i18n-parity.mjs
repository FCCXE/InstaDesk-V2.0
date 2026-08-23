// InstaDesk — i18n parity gate.
//
//   node scripts/check-i18n-parity.mjs        (run from ui/)
//
// Fails the build if the EN and ES locale files disagree. Wired as `prebuild`
// in package.json, so it runs inside every `npm run build` — which means the
// local UI gate, the Sandbox build, and the release robot (tauri's
// beforeBuildCommand shells out to `npm --prefix ui run build`).
//
// Why this exists: a missing translation does NOT crash. i18next silently falls
// back to English, so a Spanish user gets an English string and every gate stays
// green. Until now the only thing enforcing parity was a checkbox in
// docs/RELEASING.md §3 that a human had to remember.
//
// Three failure classes are detected:
//   1. MISSING   — a leaf key present in one locale and absent in the other.
//   2. SHAPE     — a path that is an object in one locale and a leaf in the
//                  other (t() returns an object; the UI renders nothing useful).
//   3. DUPLICATE — the same key twice in one object. JSON.parse silently keeps
//                  the last one, so this is invisible after parsing and has to
//                  be found by scanning the raw text.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LOCALES = ['en', 'es']
const localePath = (code) => resolve(here, '../src/i18n/locales', `${code}.json`)

/** Every leaf path in the object, dot-joined. Objects are not leaves. */
function leafPaths(node, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      leafPaths(value, path, out)
    } else {
      out.add(path)
    }
  }
  return out
}

/** Every path that holds an OBJECT (used to catch leaf-vs-object mismatches). */
function objectPaths(node, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.add(path)
      objectPaths(value, path, out)
    }
  }
  return out
}

/**
 * Duplicate keys, found by scanning the raw text.
 *
 * JSON.parse keeps the LAST value for a repeated key and reports nothing, so a
 * duplicate is undetectable once parsed — the file looks fine while one of the
 * two strings is dead. This walks the text tracking object scopes instead.
 */
function duplicateKeys(text) {
  const duplicates = []
  const stack = [] // { isObject, seen:Set, path:string }
  let pendingKey = null
  let i = 0

  const readString = () => {
    // Caller has confirmed text[i] === '"'. Returns the decoded-enough value.
    let out = ''
    i++ // opening quote
    while (i < text.length) {
      const ch = text[i]
      if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
      if (ch === '"') { i++; return out }
      out += ch
      i++
    }
    return out
  }

  while (i < text.length) {
    const ch = text[i]

    if (ch === '"') {
      const value = readString()
      // A string is a KEY if the next non-whitespace character is ':' and we
      // are directly inside an object. Otherwise it is a value.
      let j = i
      while (j < text.length && /\s/.test(text[j])) j++
      const isKey = text[j] === ':' && stack.length > 0 && stack[stack.length - 1].isObject
      if (isKey) {
        const scope = stack[stack.length - 1]
        if (scope.seen.has(value)) {
          duplicates.push(scope.path ? `${scope.path}.${value}` : value)
        }
        scope.seen.add(value)
        pendingKey = value
      }
      continue
    }

    if (ch === '{' || ch === '[') {
      const parent = stack[stack.length - 1]
      const base = parent ? parent.path : ''
      const path = pendingKey ? (base ? `${base}.${pendingKey}` : pendingKey) : base
      stack.push({ isObject: ch === '{', seen: new Set(), path })
      pendingKey = null
      i++
      continue
    }

    if (ch === '}' || ch === ']') { stack.pop(); pendingKey = null; i++; continue }
    if (ch === ',') { pendingKey = null; i++; continue }

    i++
  }

  return duplicates
}

const problems = []
const raw = {}
const parsed = {}

for (const code of LOCALES) {
  const path = localePath(code)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    problems.push(`[${code}] cannot read ${path}: ${e.message}`)
    continue
  }
  raw[code] = text
  try {
    parsed[code] = JSON.parse(text)
  } catch (e) {
    problems.push(`[${code}] is not valid JSON: ${e.message}`)
  }
}

// Bail out early only if a file is unreadable/unparseable — there is nothing
// meaningful left to compare.
if (problems.length > 0) {
  console.error('i18n parity: FAIL')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

// 3. DUPLICATE
for (const code of LOCALES) {
  for (const key of duplicateKeys(raw[code])) {
    problems.push(`[${code}] duplicate key: ${key}`)
  }
}

// 1. MISSING
const leaves = Object.fromEntries(LOCALES.map((c) => [c, leafPaths(parsed[c])]))
const objects = Object.fromEntries(LOCALES.map((c) => [c, objectPaths(parsed[c])]))

for (const [a, b] of [['en', 'es'], ['es', 'en']]) {
  for (const key of [...leaves[a]].sort()) {
    if (!leaves[b].has(key) && !objects[b].has(key)) {
      problems.push(`[${b}] missing key present in ${a}: ${key}`)
    }
  }
}

// 2. SHAPE
for (const [a, b] of [['en', 'es'], ['es', 'en']]) {
  for (const key of [...objects[a]].sort()) {
    if (leaves[b].has(key)) {
      problems.push(`shape mismatch at "${key}": object in ${a}, string in ${b}`)
    }
  }
}

const counts = LOCALES.map((c) => `${c}=${leaves[c].size}`).join(' ')

if (problems.length > 0) {
  console.error(`i18n parity: FAIL (${problems.length} problem${problems.length === 1 ? '' : 's'}) — ${counts}`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nEN and ES must stay in exact parity. A missing key does not crash —')
  console.error('i18next falls back to English, so a Spanish user silently sees English.')
  process.exit(1)
}

console.log(`i18n parity: OK — ${counts} leaf keys, sets identical, no duplicates, no shape mismatches`)

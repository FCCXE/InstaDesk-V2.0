// InstaDesk - backend error translation gate.
//
//   node scripts/check-backend-errors.mjs        (run from ui/)
//
// Fails the build if a backend error code has no translation in BOTH locales, or
// if a translation exists for a code the backend never emits.
//
// Why this exists. Until 2026-08-27 no backend message reached the user at all -
// Tauri rejects with a raw string and every catch read `.message`, which was
// undefined. Fixing that surfaced the next problem immediately: the messages are
// written in Rust, which has no access to the locale files, so a Spanish user got
// an English sentence.
//
// The fix is that Rust emits a stable CODE and the UI translates it. That only
// stays true if it is enforced: a new error added in Rust with no matching string
// would fall back to English silently, and silent English is exactly the defect
// this replaced. The i18n parity gate cannot see this - it compares the two locale
// files to EACH OTHER, so a code missing from both is perfectly "in parity".
//
// Scope, stated so the green is not read as wider than it is: this checks the
// NAMED codes. It says nothing about `map_err(|e| e.to_string())` pass-throughs,
// which carry OS and serde text that we do not author and cannot translate.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const RUST_DIR = resolve(here, '../../src-tauri/src')
const LOCALES = ['en', 'es']

function rustFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) rustFiles(full, out)
    else if (full.endsWith('.rs')) out.push(full)
  }
  return out
}

// Codes are emitted as berr("code", ...) / berr_args("code", ...).
const emitted = new Set()
for (const file of rustFiles(RUST_DIR)) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\bberr(?:1|_args)?\s*\(\s*"([a-zA-Z][\w.]*)"/g)) {
    emitted.add(m[1])
  }
}

const locales = Object.fromEntries(
  LOCALES.map(code => [
    code,
    JSON.parse(readFileSync(resolve(here, '../src/i18n/locales', `${code}.json`), 'utf8')),
  ]),
)

const problems = []
for (const code of [...emitted].sort()) {
  for (const loc of LOCALES) {
    const value = locales[loc]?.backendErrors?.[code]
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`[${loc}] backendErrors.${code} is missing - Rust emits this code`)
    }
  }
}

// The other direction: a translation nobody can ever show is dead weight, and
// usually means a code was renamed and one half was updated.
for (const loc of LOCALES) {
  for (const code of Object.keys(locales[loc]?.backendErrors ?? {})) {
    if (!emitted.has(code)) {
      problems.push(`[${loc}] backendErrors.${code} has no matching berr() in Rust - orphan`)
    }
  }
}

if (problems.length > 0) {
  console.error(`backend errors: FAIL - ${problems.length} problem(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nEvery backend error code needs a string in BOTH locales. A code with no')
  console.error('translation falls back to English silently - the defect this replaced.')
  process.exit(1)
}

if (emitted.size === 0) {
  // Say it loudly: a pass over nothing is not evidence of anything.
  console.log('backend errors: 0 codes emitted by Rust - NOTHING WAS CHECKED')
} else {
  console.log(`backend errors: OK - ${emitted.size} code(s), each translated in ${LOCALES.length} locales`)
}

// InstaDesk - stray control byte gate.
//
//   node scripts/check-source-bytes.mjs        (run from ui/)
//
// Fails the build if a source file contains a raw control character. Wired into
// `checks` -> `prebuild`.
//
// Why this exists. This defect class has bitten this codebase twice, and both
// times the damage was invisible on screen:
//
//   2026-06-06  layoutBuilder.ts:146 - the comment says the region grouping key is
//               `${app}\0${args}`, and the author wrote that escape. What landed
//               in the file is a raw NUL byte. It BEHAVES correctly, which is
//               exactly why nobody noticed for months: a literal NUL and \0
//               produce the same string.
//
//   2026-08-26  a regex written through a shell heredoc had its \b word
//               boundaries eaten into literal 0x08 BACKSPACE bytes. The gate it
//               belonged to then matched nothing and reported OK - a decorative
//               check that certified the defect it was written to catch. Only a
//               bite test found it.
//
// The costs of a stray control byte are indirect but real: `grep` classifies the
// file as binary and silently refuses to search it (this happened twice while
// investigating the URL group work), diffs and editors may mangle it, and any tool
// that strips control characters would change behaviour without changing anything
// a reader can see. In the NUL case that would collapse the region grouping key
// and merge two regions that must stay distinct - resurrecting the
// two-windows-of-one-app defect.
//
// Escapes are the correct way to write these characters. If a byte is genuinely
// needed, write it as \0,  and so on, where a reader can see it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')

/** Tab, newline and carriage return are ordinary formatting and are allowed. */
const ALLOWED = new Set([0x09, 0x0a, 0x0d])

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|css|json)$/.test(full)) out.push(full)
  }
  return out
}

const files = walk(SRC)
const problems = []

for (const file of files) {
  const rel = relative(SRC, file).replace(/\\/g, '/')
  const raw = readFileSync(file)
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i]
    if (b >= 0x20 && b !== 0x7f) continue
    if (ALLOWED.has(b)) continue
    // Line number, and a readable window of context.
    const line = raw.subarray(0, i).toString('utf8').split('\n').length
    const ctx = raw.subarray(Math.max(0, i - 30), i + 10).toString('utf8').replace(/[\x00-\x1f\x7f]/g, '?')
    problems.push(
      `src/${rel}:${line}  byte 0x${b.toString(16).padStart(2, '0')} - a raw control character, near: ${JSON.stringify(ctx)}`,
    )
    break // one report per file is enough to act on
  }
}

if (problems.length > 0) {
  console.error(`source bytes: FAIL - ${problems.length} file(s) contain a raw control character`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nWrite the character as an escape (\\0, \\u0008) so a reader can see it.')
  console.error('A raw control byte is invisible on screen, makes grep treat the file as')
  console.error('binary, and changes behaviour if any tool strips it.')
  process.exit(1)
}

console.log(`source bytes: OK - ${files.length} source file(s), no raw control characters`)

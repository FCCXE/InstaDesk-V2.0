// InstaDesk - changelog publication gate.
//
//   node scripts/check-changelog-clean.mjs        (run from ui/)
//
// Fails the build if a RELEASED CHANGELOG section contains an internal
// engineering note. Wired into `checks` -> `prebuild`.
//
// Why this exists. On 2026-08-27 v0.5.0 shipped with this as the FIRST LINE that
// users read on the public release page:
//
//   _Sandbox-validated (RELEASING.md 3.5) - build `0.4.0-sb.1787788836748`,
//    installed from the local side-by-side installer and confirmed by the operator._
//
// Nobody was careless. RELEASING.md 3.5 step 4 instructs the releaser to record the
// sandbox pass in the CHANGELOG's [Unreleased] notes -- and [Unreleased] is exactly
// the section bump-version.mjs rolls into the published release body. Two steps of
// one procedure, each sensible on its own, that together publish an internal record
// every single time. The procedure has been corrected to keep that record in the
// work plan; this gate is what makes the correction stick.
//
// Scope: [Unreleased] is deliberately NOT checked - it is the working area and may
// hold anything until it is rolled into a version.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CHANGELOG = resolve(here, '../../CHANGELOG.md')

/** Markers that mean "written for us, not for a user". */
const INTERNAL = [
  { re: /RELEASING\.md/i,   why: 'cites an internal procedure document' },
  { re: /sandbox-validated/i, why: 'an internal validation record' },
  { re: /-sb\.\d{6,}/i,     why: 'a local Sandbox build stamp, which no user can obtain' },
]

const HEADING = /^##\s*\[([^\]]+)\]/

const lines = readFileSync(CHANGELOG, 'utf8').split('\n')
const problems = []
let section = null
let released = false
let sections = 0

lines.forEach((line, i) => {
  if (/^## /.test(line)) {
    const m = HEADING.exec(line)
    section = m ? m[1] : line.slice(3).trim()
    if (m) sections++
    released = !!m && section.toLowerCase() !== 'unreleased'
    return
  }
  if (!released) return
  for (const { re, why } of INTERNAL) {
    if (re.test(line)) {
      problems.push(`CHANGELOG.md:${i + 1}  [${section}] ${why}: ${JSON.stringify(line.trim().slice(0, 72))}`)
    }
  }
})

if (problems.length > 0) {
  console.error(`changelog clean: FAIL - ${problems.length} internal note(s) in released section(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nA released section becomes the PUBLIC release body. Keep engineering')
  console.error('records in the work plan; [Unreleased] may hold anything until it rolls.')
  process.exit(1)
}

if (sections === 0) {
  console.log('changelog clean: 0 version sections found - NOTHING WAS CHECKED')
} else {
  console.log(`changelog clean: OK - ${sections} version section(s), no internal notes in any released one`)
}

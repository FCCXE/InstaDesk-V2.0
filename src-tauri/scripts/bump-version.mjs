// Bump the InstaDesk version in one command.
//
//   node src-tauri/scripts/bump-version.mjs 0.1.29 [--dry-run]
//
// Updates, consistently and in one place:
//   - src-tauri/tauri.conf.json   ("version")   ← the field the bundler stamps
//   - src-tauri/Cargo.toml        ([package] version)
//   - CHANGELOG.md                rolls "## [Unreleased]" into "## [X.Y.Z] - <today>"
//                                 and refreshes the link references
//
// It does NOT build, commit, tag, or push — see docs/RELEASING.md for the full
// procedure. Cargo.lock's app version is refreshed by the next build.
// (--dry-run prints the intended changes without writing.)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const TAURI_CONF = resolve(here, '../tauri.conf.json')
const CARGO_TOML = resolve(here, '../Cargo.toml')
const CHANGELOG = resolve(here, '../../CHANGELOG.md')
const REPO = 'https://github.com/FCCXE/InstaDesk-V2.0'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const next = args.find((a) => !a.startsWith('--'))

if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Usage: node src-tauri/scripts/bump-version.mjs <X.Y.Z> [--dry-run]')
  process.exit(1)
}

// Current version is the source of truth in tauri.conf.json.
const confText = readFileSync(TAURI_CONF, 'utf8')
const curMatch = confText.match(/"version"\s*:\s*"(\d+\.\d+\.\d+)"/)
if (!curMatch) { console.error('Could not find "version" in tauri.conf.json'); process.exit(1) }
const cur = curMatch[1]
if (cur === next) { console.error(`Version is already ${cur}.`); process.exit(1) }

const today = new Date().toISOString().slice(0, 10)
const edits = []

// 1) tauri.conf.json
edits.push({
  path: TAURI_CONF,
  text: confText.replace(`"version": "${cur}"`, `"version": "${next}"`),
  note: `"version" ${cur} → ${next}`,
})

// 2) Cargo.toml — only the first (package) version line
const cargoText = readFileSync(CARGO_TOML, 'utf8')
if (!cargoText.includes(`version = "${cur}"`)) { console.error(`Cargo.toml has no version = "${cur}"`); process.exit(1) }
edits.push({
  path: CARGO_TOML,
  text: cargoText.replace(`version = "${cur}"`, `version = "${next}"`),
  note: `[package] version ${cur} → ${next}`,
})

// 3) CHANGELOG.md — roll Unreleased into a dated section + refresh links
let changelog = readFileSync(CHANGELOG, 'utf8')
if (!changelog.includes('## [Unreleased]')) { console.error('CHANGELOG.md has no "## [Unreleased]" section'); process.exit(1) }
changelog = changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${next}] - ${today}`)
// link refs (best-effort; only if the block exists)
if (changelog.includes(`[Unreleased]:`)) {
  changelog = changelog.replace(
    /\[Unreleased\]:.*$/m,
    `[Unreleased]: ${REPO}/compare/v${next}...HEAD\n[${next}]: ${REPO}/releases/tag/v${next}`,
  )
}
edits.push({ path: CHANGELOG, text: changelog, note: `roll [Unreleased] → [${next}] - ${today}` })

console.log(`Bumping ${cur} → ${next}${dryRun ? '  (dry run)' : ''}`)
for (const e of edits) {
  console.log(`  ${dryRun ? 'would update' : 'updated'}: ${e.path.replace(/.*instadesk-tauri[\\/]/, '')}  (${e.note})`)
  if (!dryRun) writeFileSync(e.path, e.text)
}
if (dryRun) { console.log('\nNo files written (dry run).'); process.exit(0) }
console.log(`\nNext: review the diff, then follow docs/RELEASING.md (build → manifest → commit → tag v${next} → publish → verify).`)

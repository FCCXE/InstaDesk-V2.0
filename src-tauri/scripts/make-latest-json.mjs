// Generate the updater manifest (latest.json) from a SIGNED release build.
//
//   node src-tauri/scripts/make-latest-json.mjs ["release notes"]
//
// Run AFTER `npx tauri build --bundles nsis` with the signing key set
// (TAURI_SIGNING_PRIVATE_KEY). It reads the produced .sig and writes a
// latest.json the auto-updater endpoint serves. Upload three files to the
// matching GitHub release (tag v<version>): the setup .exe, its .sig, and
// latest.json. The app's updater config points at
//   https://github.com/FCCXE/InstaDesk-V2.0/releases/latest/download/latest.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const inner = resolve(here, '../..') // <inner repo root>
const REPO = 'FCCXE/InstaDesk-V2.0'

const conf = JSON.parse(readFileSync(resolve(inner, 'src-tauri/tauri.conf.json'), 'utf8'))
const version = conf.version
const setupName = `InstaDesk_${version}_x64-setup.exe`
const nsisDir = resolve(inner, 'src-tauri/target/release/bundle/nsis')
const sigPath = resolve(nsisDir, `${setupName}.sig`)

if (!existsSync(sigPath)) {
  console.error(`[make-latest-json] Missing signature:\n  ${sigPath}`)
  console.error('[make-latest-json] Build first WITH signing:')
  console.error('  TAURI_SIGNING_PRIVATE_KEY=... npx tauri build --bundles nsis')
  process.exit(1)
}

const latest = {
  version,
  notes: process.argv[2] || `InstaDesk ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: readFileSync(sigPath, 'utf8').trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${setupName}`,
    },
  },
}

const out = resolve(nsisDir, 'latest.json')
writeFileSync(out, JSON.stringify(latest, null, 2))
console.log(`[make-latest-json] wrote ${out}`)
console.log(`[make-latest-json] create GitHub release tag "v${version}" and upload:`)
console.log(`  - ${setupName}`)
console.log(`  - ${setupName}.sig`)
console.log(`  - latest.json`)

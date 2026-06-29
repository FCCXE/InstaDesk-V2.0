// Build a SANDBOX flavor of InstaDesk — a fully isolated, side-by-side install
// used to validate a candidate version BEFORE it is ever promoted to a real
// release. ROBOT-FREE: this runs entirely locally, produces an UNSIGNED installer
// with a distinct identity, and touches nothing on GitHub or any live endpoint.
//
//   node src-tauri/scripts/sandbox.mjs            # build the NSIS installer (final pre-promotion artifact)
//   node src-tauri/scripts/sandbox.mjs --debug    # faster (debug) installer build
//   node src-tauri/scripts/sandbox.mjs --dev      # run it LIVE — hot-reload, NO install (fast iteration loop)
//
// What makes it safe + side-by-side (see src-tauri/tauri.sandbox.conf.json, which
// this layers over tauri.conf.json via `tauri build --config`):
//   • identifier  com.fcxestudios.instadesk.sandbox → separate data dir + single-
//     instance lock + window-state, so it runs ALONGSIDE the stable app.
//   • productName "InstaDesk Sandbox"               → separate install folder + Start
//     menu entry; window title "InstaDesk — SANDBOX".
//   • createUpdaterArtifacts:false                  → no updater signing key needed,
//     so the build runs locally with zero secrets.
//   • INSTADESK_SANDBOX=1 (set below)               → ui/vite.config.ts stamps
//     VITE_INSTADESK_SANDBOX, so the UI renders the mandatory on-screen SANDBOX
//     badge and disables auto-update (ui/src/services/updater.ts).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const innerRepo = resolve(here, '../..')                 // .../instadesk-tauri
const overrideCfg = resolve(here, '../tauri.sandbox.conf.json')
// Pass --config as a path RELATIVE to innerRepo (the spawn cwd). The absolute repo
// path can contain spaces (e.g. "C:\FcXe Studios\…"); under `shell:true` on Windows
// an unquoted space would split the argument, so we keep this value space-free.
const overrideCfgRel = 'src-tauri/tauri.sandbox.conf.json'

if (!existsSync(overrideCfg)) {
  console.error(`[sandbox] override config missing: ${overrideCfg}`)
  process.exit(1)
}

const dev = process.argv.includes('--dev')
const debug = process.argv.includes('--debug')
const outDir = resolve(innerRepo, `src-tauri/target/${debug ? 'debug' : 'release'}/bundle/nsis`)

// The on-screen SANDBOX badge is driven by this env var, read in ui/vite.config.ts.
const env = { ...process.env, INSTADESK_SANDBOX: '1' }

// --dev  → run the app LIVE (hot-reload, isolated identity + badge, NO installer):
//          the fast iteration loop, no .exe to install.
// default→ build the unsigned NSIS installer (the final pre-promotion artifact).
const args = dev
  ? ['tauri', 'dev', '--config', overrideCfgRel]
  : ['tauri', 'build', '--config', overrideCfgRel, '--bundles', 'nsis', ...(debug ? ['--debug'] : [])]

console.log(`[sandbox] ${dev ? 'Running' : 'Building'} InstaDesk SANDBOX (${dev ? 'dev / live' : debug ? 'debug' : 'release'}) — robot-free, isolated identity.`)
console.log(`[sandbox] config override: ${overrideCfgRel}`)
const r = spawnSync('npx', args, {
  cwd: innerRepo,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',   // npx is npx.cmd on Windows
})
if (r.status !== 0) {
  console.error(`[sandbox] ${dev ? 'dev session' : 'build'} failed (exit ${r.status}).`)
  process.exit(r.status ?? 1)
}

// Dev session just ended (the live app window was closed) — nothing to bundle.
if (dev) process.exit(0)

// Locate the produced installer (productName has a space → "InstaDesk Sandbox_...").
let installer = null
if (existsSync(outDir)) {
  const hits = readdirSync(outDir)
    .filter((f) => /Sandbox.*setup\.exe$/i.test(f))
    .map((f) => join(outDir, f))
  if (hits.length) installer = hits.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}
if (installer) {
  const mb = (statSync(installer).size / (1024 * 1024)).toFixed(1)
  console.log(`\n[sandbox] OK Installer: ${installer} (${mb} MB)`)
  console.log('[sandbox] Install it — it lands SIDE-BY-SIDE with stable InstaDesk and shows the on-screen SANDBOX badge.')
} else {
  console.log(`\n[sandbox] Build done, but no *Sandbox*setup.exe found in ${outDir}`)
}

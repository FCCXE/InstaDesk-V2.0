// Build / run / PUBLISH a SANDBOX flavor of InstaDesk — a fully isolated, side-by-
// side app used to validate a candidate version BEFORE it is promoted to a real
// release. ROBOT-FREE: nothing here runs the release robot (.github/workflows/
// release.yml) and nothing touches stable users.
//
//   node src-tauri/scripts/sandbox.mjs            # build the NSIS installer (final pre-promotion artifact)
//   node src-tauri/scripts/sandbox.mjs --debug    # faster (debug) installer build
//   node src-tauri/scripts/sandbox.mjs --dev      # run it LIVE — hot-reload, NO install (fast iteration loop)
//   node src-tauri/scripts/sandbox.mjs --publish  # build SIGNED + push to the self-update Sandbox channel
//   node src-tauri/scripts/sandbox.mjs --publish --dry-run   # do everything EXCEPT the gh upload
//
// Isolation (src-tauri/tauri.sandbox.conf.json, layered via `tauri build --config`):
//   • identifier  com.fcxestudios.instadesk.sandbox → separate data dir + single-
//     instance lock + window-state, so it runs ALONGSIDE the stable app.
//   • productName "InstaDesk Sandbox"               → separate install folder.
//   • INSTADESK_SANDBOX=1 (set below)               → on-screen SANDBOX badge.
//   • plugins.updater.endpoints → the sandbox-channel feed (NOT stable's feed).
//
// --publish: signs the build with the local updater key (src-tauri/.tauri-keys/
// updater.key), stamps a monotonic version "<base>-sb.<ms>" so an installed Sandbox
// sees it as newer, and uploads installer + signature manifest to a permanent
// PRERELEASE tag `sandbox-channel`. That tag is never "Latest", so it can never
// reach stable auto-update users — but installed Sandboxes self-update from it.
import { spawnSync } from 'node:child_process'
import {
  existsSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync,
} from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const innerRepo = resolve(here, '../..')                 // .../instadesk-tauri
const overrideCfg = resolve(here, '../tauri.sandbox.conf.json')
const overrideCfgRel = 'src-tauri/tauri.sandbox.conf.json' // relative → space-free under shell
const baseConf = resolve(here, '../tauri.conf.json')
const keyFile = resolve(here, '../.tauri-keys/updater.key')

const REPO = 'FCCXE/InstaDesk-V2.0'
const CHANNEL_TAG = 'sandbox-channel'
const INSTALLER_NAME = 'InstaDesk-Sandbox-setup.exe' // space-free, stable URL across builds
const FEED_URL = `https://github.com/${REPO}/releases/download/${CHANNEL_TAG}/latest.json`
const INSTALLER_URL = `https://github.com/${REPO}/releases/download/${CHANNEL_TAG}/${INSTALLER_NAME}`

if (!existsSync(overrideCfg)) {
  console.error(`[sandbox] override config missing: ${overrideCfg}`)
  process.exit(1)
}

const dev = process.argv.includes('--dev')
const debug = process.argv.includes('--debug')
const publish = process.argv.includes('--publish')
const dryRun = process.argv.includes('--dry-run')

// The on-screen SANDBOX badge is driven by this env var, read in ui/vite.config.ts.
const env = { ...process.env, INSTADESK_SANDBOX: '1' }
const onWin = process.platform === 'win32'

function findInstaller(outDir) {
  if (!existsSync(outDir)) return null
  const hits = readdirSync(outDir)
    .filter((f) => /Sandbox.*setup\.exe$/i.test(f))
    .map((f) => join(outDir, f))
  return hits.length ? hits.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] : null
}

// ----------------------------- PUBLISH ------------------------------------
if (publish) {
  if (!existsSync(keyFile)) {
    console.error(`[sandbox] updater signing key missing: ${keyFile} (see RELEASING.md §8)`)
    process.exit(1)
  }
  const base = JSON.parse(readFileSync(baseConf, 'utf8')).version
  const version = `${base}-sb.${Date.now()}` // monotonic → installed Sandbox sees newer builds
  console.log(`[sandbox] PUBLISH build ${version}${dryRun ? ' (DRY-RUN — no upload)' : ''}`)

  // Temp override: sandbox config + this version + signed updater artifacts. Kept
  // out of the committed config so a plain build still needs no signing key.
  const sb = JSON.parse(readFileSync(overrideCfg, 'utf8'))
  sb.version = version
  sb.bundle = { ...(sb.bundle || {}), createUpdaterArtifacts: true }
  const tmpRel = 'src-tauri/.sandbox-publish.tmp.json'
  const tmpAbs = resolve(innerRepo, tmpRel)
  writeFileSync(tmpAbs, JSON.stringify(sb, null, 2))

  const buildEnv = {
    ...env,
    INSTADESK_VERSION_OVERRIDE: version, // header shows the real -sb build id (changes after self-update)
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyFile, 'utf8'),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
  }
  const r = spawnSync('npx', ['tauri', 'build', '--config', tmpRel, '--bundles', 'nsis'],
    { cwd: innerRepo, env: buildEnv, stdio: 'inherit', shell: onWin })
  try { rmSync(tmpAbs, { force: true }) } catch { /* best-effort cleanup */ }
  if (r.status !== 0) { console.error(`[sandbox] publish build failed (exit ${r.status}).`); process.exit(r.status ?? 1) }

  const installer = findInstaller(resolve(innerRepo, 'src-tauri/target/release/bundle/nsis'))
  if (!installer) { console.error('[sandbox] no installer produced.'); process.exit(1) }
  const sig = `${installer}.sig`
  if (!existsSync(sig)) { console.error(`[sandbox] signature missing: ${sig}`); process.exit(1) }

  // Stage under a fixed, space-free name so the feed URL is stable across builds.
  const pubDir = resolve(innerRepo, 'src-tauri/target/sandbox-channel')
  mkdirSync(pubDir, { recursive: true })
  copyFileSync(installer, join(pubDir, INSTALLER_NAME))
  const latest = {
    version,
    notes: 'InstaDesk Sandbox channel build (isolated test channel — never reaches stable users).',
    pub_date: new Date().toISOString(),
    platforms: { 'windows-x86_64': { signature: readFileSync(sig, 'utf8').trim(), url: INSTALLER_URL } },
  }
  writeFileSync(join(pubDir, 'latest.json'), JSON.stringify(latest, null, 2))
  console.log(`[sandbox] staged ${INSTALLER_NAME} + latest.json under ${pubDir}`)

  if (dryRun) {
    console.log(`[sandbox] DRY-RUN complete — skipped gh create/upload. Feed would be ${FEED_URL}`)
    process.exit(0)
  }

  // Ensure the permanent prerelease channel exists, then upload (clobber). Run gh
  // from pubDir with relative filenames so the space in the repo path is irrelevant.
  const channelExists = spawnSync('gh', ['release', 'view', CHANNEL_TAG, '--repo', REPO],
    { stdio: 'ignore', shell: onWin }).status === 0
  if (!channelExists) {
    console.log(`[sandbox] creating ${CHANNEL_TAG} prerelease...`)
    const c = spawnSync('gh', ['release', 'create', CHANNEL_TAG, '--repo', REPO, '--prerelease',
      '--title', 'InstaDesk Sandbox channel',
      '--notes', 'Isolated self-update channel for the InstaDesk Sandbox. Never "Latest"; never reaches stable users.'],
      { stdio: 'inherit', shell: onWin })
    if (c.status !== 0) { console.error('[sandbox] failed to create channel release.'); process.exit(1) }
  }
  const u = spawnSync('gh', ['release', 'upload', CHANNEL_TAG, INSTALLER_NAME, 'latest.json', '--repo', REPO, '--clobber'],
    { cwd: pubDir, stdio: 'inherit', shell: onWin })
  if (u.status !== 0) { console.error('[sandbox] upload failed.'); process.exit(1) }
  console.log(`[sandbox] OK published ${version} → ${FEED_URL}`)
  console.log('[sandbox] Installed Sandboxes will offer it via Settings → Updates / Check for updates.')
  process.exit(0)
}

// --------------------------- dev / build / debug --------------------------
const outDir = resolve(innerRepo, `src-tauri/target/${debug ? 'debug' : 'release'}/bundle/nsis`)
const args = dev
  ? ['tauri', 'dev', '--config', overrideCfgRel]
  : ['tauri', 'build', '--config', overrideCfgRel, '--bundles', 'nsis', ...(debug ? ['--debug'] : [])]

console.log(`[sandbox] ${dev ? 'Running' : 'Building'} InstaDesk SANDBOX (${dev ? 'dev / live' : debug ? 'debug' : 'release'}) — robot-free, isolated identity.`)
const r = spawnSync('npx', args, { cwd: innerRepo, env, stdio: 'inherit', shell: onWin })
if (r.status !== 0) { console.error(`[sandbox] ${dev ? 'dev session' : 'build'} failed (exit ${r.status}).`); process.exit(r.status ?? 1) }
if (dev) process.exit(0)

const installer = findInstaller(outDir)
if (installer) {
  const mb = (statSync(installer).size / (1024 * 1024)).toFixed(1)
  console.log(`\n[sandbox] OK Installer: ${installer} (${mb} MB)`)
  console.log('[sandbox] Install it — it lands SIDE-BY-SIDE with stable InstaDesk and shows the on-screen SANDBOX badge.')
} else {
  console.log(`\n[sandbox] Build done, but no *Sandbox*setup.exe found in ${outDir}`)
}

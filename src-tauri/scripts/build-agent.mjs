// Publish the C# WinAgent as a self-contained single-file exe and stage it as a
// Tauri bundle resource.
//
//   node src-tauri/scripts/build-agent.mjs
//
// Run automatically by `tauri build` (wired into beforeBuildCommand). Produces
//   src-tauri/binaries/InstaDesk.WinAgent.exe
// which tauri.conf.json bundles as a resource; the Rust backend resolves it via
// the path API and shells out to it directly — so the packaged app needs NO
// machine-wide `dotnet` runtime.
//
// Flavor: self-contained + single-file + compression, NOT ReadyToRun and NOT
// trimmed. The agent uses Windows Forms (the Snap overlay), which is incompatible
// with Native AOT and unsafe to trim; ReadyToRun would ~double the size (170 MB)
// for a startup win that's irrelevant to a short-lived subprocess. This flavor
// lands ~69 MB and runs standalone. The exe is gitignored (the *.exe rule) — it
// is a build artifact regenerated from the version-controlled agent source.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// here = <inner>/src-tauri/scripts → up 3 = the OUTER repo root (sibling of the
// inner Tauri repo), where the WinAgent C# project lives.
const project = resolve(here, '../../../winagent/InstaDesk.WinAgent/InstaDesk.WinAgent.csproj')
const outDir = resolve(here, '../binaries')
const outExe = resolve(outDir, 'InstaDesk.WinAgent.exe')

if (!existsSync(project)) {
  console.error(`[build-agent] WinAgent project not found at:\n  ${project}`)
  console.error('[build-agent] The agent source lives in the outer repo (a sibling of this one).')
  process.exit(1)
}

const ver = spawnSync('dotnet', ['--version'], { encoding: 'utf8' })
if (ver.status !== 0) {
  console.error('[build-agent] `dotnet` SDK not found on PATH — required to publish the WinAgent.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

const args = [
  'publish', project,
  '-c', 'Release',
  '-r', 'win-x64',
  '--self-contained', 'true',
  '-p:PublishSingleFile=true',
  '-p:IncludeNativeLibrariesForSelfExtract=true',
  '-p:PublishReadyToRun=false',
  '-p:EnableCompressionInSingleFile=true',
  '-p:DebugType=none',
  '-p:DebugSymbols=false',
  '-o', outDir,
]

console.log(`[build-agent] Publishing WinAgent (.NET ${ver.stdout.trim()}) → ${outExe}`)
const r = spawnSync('dotnet', args, { stdio: 'inherit' })
if (r.status !== 0 || !existsSync(outExe)) {
  console.error(`[build-agent] publish failed (exit ${r.status}).`)
  process.exit(1)
}

const mb = (statSync(outExe).size / (1024 * 1024)).toFixed(1)
console.log(`[build-agent] ✓ ${outExe} (${mb} MB)`)

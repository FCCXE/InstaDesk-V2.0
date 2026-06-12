// Build the InstaDesk PDF manuals from the version-controlled HTML sources.
//
//   node docs/manual/build-manual.mjs
//
// Self-contained: drives an already-installed Chrome (or Edge) in headless mode
// via --print-to-pdf. No npm dependencies, no LaTeX/Pandoc/Typst. The clickable
// table of contents (anchor links) carries through to the PDF as the
// "interactive index". Outputs to ui/public/manual/ so the app can serve/bundle
// the files. Re-run after adding screenshots (see img/README.md).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../ui/public/manual')

// Find a Chromium-family browser to print with.
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const browser = CANDIDATES.find((p) => existsSync(p))
if (!browser) {
  console.error('No Chrome/Edge found. Set CHROME_PATH to a Chromium browser exe.')
  process.exit(1)
}

const JOBS = [
  { src: 'manual.en.html', out: 'InstaDesk-Manual-EN.pdf' },
  { src: 'manual.es.html', out: 'InstaDesk-Manual-ES.pdf' },
]

mkdirSync(outDir, { recursive: true })
console.log(`Using browser: ${browser}`)

let failed = false
for (const job of JOBS) {
  const srcUrl = pathToFileURL(resolve(here, job.src)).href
  const outPath = resolve(outDir, job.out)
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=4000',
    `--print-to-pdf=${outPath}`,
    srcUrl,
  ]
  const r = spawnSync(browser, args, { stdio: 'inherit' })
  if (r.status === 0 && existsSync(outPath)) {
    console.log(`  ✓ ${job.out}`)
  } else {
    console.error(`  ✗ ${job.out} (exit ${r.status})`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)

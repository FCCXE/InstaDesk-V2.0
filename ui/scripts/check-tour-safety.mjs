// InstaDesk — walkthrough safety gate.
//
//   node scripts/check-tour-safety.mjs        (run from ui/)
//
// Fails the build if any walkthrough module references an action that could
// disturb the user's desktop or destroy their saved work. Wired into `checks`
// -> `prebuild`, so it runs in the local UI gate, the Sandbox build and the
// release robot.
//
// This is the mechanical form of ruling D-1. A rule written in a document stops
// nothing; this stops a build.
//
// THE BOUNDARY HAS THREE AXES. The first classification of it was wrong in the
// reassuring direction, which is why all three are enforced here:
//
//   Axis 1 — mutates the user's desktop. A ONE-HOP call analysis put
//            presets_run ("Apply a Layout") in the SAFE column; it reaches the
//            WinAgent through run_launch. Only the transitive closure is
//            correct: 9 of 32 commands reach the agent, 23 do not, 9+23=32.
//
//   Axis 2 — destroys or overwrites saved data WITHOUT touching a window.
//            presets_delete / quickpresets_delete call fs::remove_file;
//            presets_save / quickpresets_save overwrite a slot. All of these
//            sit in axis 1's "safe" column.
//
//   Axis 3 — destructive UI-layer mutators that NEVER REACH RUST AT ALL, so
//            they appear nowhere in the 32-command surface. clearAllGrids wipes
//            every monitor's assignments in one call. A guard on the api.ts
//            boundary alone would not see it. This axis is the reason the check
//            scans identifiers rather than API calls.
//
// Note on precision: this matches identifiers textually, so a variable or a
// comment that happens to use a forbidden name will trip it. That is the safe
// direction — a false positive is a loud failure a human resolves, whereas a
// false negative ships a tutorial that can close the user's windows.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src')
const TOUR_DIR = resolve(SRC, 'tour')

/** identifier -> why it is forbidden */
const FORBIDDEN = {
  // --- Axis 1: mutates the user's desktop (6) ---
  launch: 'axis 1 — launches programs and positions windows',
  presetsRun: 'axis 1 — applies a Layout: launches and tiles everything',
  quickPresetsRun: 'axis 1 — applies a bundle of Layouts',
  snapPopup: 'axis 1 — spawns the native overlay and moves a window',
  arrangeAllWindows: 'axis 1 — minimises/restores every window',
  closeAllWindows: 'axis 1 — closes every window (destructive)',
  // Added by the Quick Preset Switch programme BEFORE these verbs exist, so the gate
  // is proven against them rather than retrofitted once there is something to catch.
  // Switching tears down the live preset's windows: strictly more destructive than
  // an Apply, which only adds.
  quickPresetsSwitch: 'axis 1 — swaps presets: CLOSES the live preset’s windows, then applies another',
  quickpresets_switch: 'axis 1 — the Rust command name, in case it is reached as a string literal',

  // --- Axis 2: destroys or overwrites saved data (6) ---
  presetsDelete: 'axis 2 — permanently deletes a saved Layout (fs::remove_file)',
  quickPresetsDelete: 'axis 2 — permanently deletes a saved Quick Preset (fs::remove_file)',
  presetsSave: 'axis 2 — overwrites a Layout slot (fs::write)',
  quickPresetsSave: 'axis 2 — overwrites a Quick Preset slot (fs::write)',
  licenseDeactivate: 'axis 2 — frees this device’s licence seat',
  // Added beyond the ruled list: activating consumes a seat from a limited
  // device allowance, so a tutorial must not call it either.
  licenseActivate: 'axis 2 (added) — consumes a device seat from a limited allowance',

  // --- Axis 3: destructive UI-layer mutators, invisible to the API surface (6) ---
  clearAllGrids: 'axis 3 — wipes EVERY monitor’s assignments, args and grid sizes',
  resizeMonitor: 'axis 3 — wipes that monitor’s assignments and args overrides',
  replaceGrid: 'axis 3 — clears every cell outside the supplied map',
  replaceGridMulti: 'axis 3 — clears cells across monitors outside the supplied map',
  clearGrid: 'axis 3 — clears the current monitor’s grid',
  pasteGrid: 'axis 3 — overwrites the current monitor’s grid',
}

/** Direct Tauri calls bypass api.ts entirely, so the identifier list would not
 *  see them. The walkthrough has no legitimate reason to invoke() directly. */
const BYPASS = /\binvoke\s*[<(]/

/** A denylist only forbids what somebody remembered to add to it. That is the
 *  recorded "verifications narrow to what they NAME" failure mode: ship a command
 *  under a name nobody listed, and the gate waves it through while staying green.
 *  The Quick Preset Switch programme adds new commands, so that gap is now real.
 *
 *  The api surface is therefore closed STRUCTURALLY rather than name by name: the
 *  walkthrough may not reach `api` at all. Measured 2026-08-25 — tour code imports
 *  api nowhere and references zero `api.*` members — so this forbids nothing that is
 *  in use, while covering every command that does not exist yet. If a future
 *  walkthrough genuinely needs a read-only call, this fails loudly and a human rules
 *  on it; what it cannot do is pass silently. */
const API_MEMBER = /\bapi\s*\.\s*[A-Za-z_]/
const API_IMPORT = /from\s+['"][^'"]*services\/api['"]/

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const files = walk(TOUR_DIR)
const problems = []

for (const file of files) {
  const rel = relative(SRC, file).replace(/\\/g, '/')
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [name, why] of Object.entries(FORBIDDEN)) {
      // `launch` is the only forbidden name that is also an ordinary English
      // word, and it tripped twice on comments about application start-up. The
      // answer is precision, not tolerance: for THAT name only, require call or
      // member form (`api.launch`, `launch(`). Rewording prose to appease a
      // check is how a gate quietly erodes — the check should be RIGHT, not
      // merely quiet. Every other name stays a blunt identifier match; none of
      // them occurs in English prose.
      const pattern =
        name === 'launch'
          ? new RegExp(`\\.${name}\\b|\\b${name}\\s*\\(`)
          : new RegExp(`\\b${name}\\b`)
      if (pattern.test(line)) {
        problems.push(`src/${rel}:${i + 1}  ${name} — ${why}`)
      }
    }
    if (BYPASS.test(line)) {
      problems.push(`src/${rel}:${i + 1}  invoke() — the walkthrough must not call Tauri directly (bypasses this gate)`)
    }
    if (API_MEMBER.test(line)) {
      problems.push(`src/${rel}:${i + 1}  api.* — the walkthrough must not reach the command surface at all (closes the denylist gap)`)
    }
    if (API_IMPORT.test(line)) {
      problems.push(`src/${rel}:${i + 1}  imports services/api — the walkthrough must not reach the command surface at all`)
    }
  })
}

if (problems.length > 0) {
  console.error(`tour safety: FAIL — ${problems.length} violation(s) across ${files.length} walkthrough file(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nRuling D-1: the walkthrough never fires an action that mutates the desktop')
  console.error('or destroys saved work. Show the outcome with the schematic animation instead.')
  process.exit(1)
}

if (files.length === 0) {
  // Say this loudly. A pass over nothing is not evidence of anything, and the
  // increment that introduces the tour must see this line change.
  console.log('tour safety: 0 walkthrough files found (src/tour/ does not exist yet) — NOTHING WAS CHECKED')
} else {
  console.log(`tour safety: OK — ${files.length} walkthrough file(s) scanned, ${Object.keys(FORBIDDEN).length} forbidden identifiers + direct invoke() + no api.* reach`)
}

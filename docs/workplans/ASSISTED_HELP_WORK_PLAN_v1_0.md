# Assisted Interactive Help — Work Plan v1.0

**Status:** ACTIVE · **Created:** 2026-08-23 · **Target release:** v0.4.0 (MINOR — new user-facing feature)
**Repo:** `C:\FcXe Studios\Instadesk\instadesk-tauri` · **Baseline:** `303fce2` on `main`
**Evidence base:** [`ASSISTED_HELP_INVESTIGATION_v1_0.md`](./ASSISTED_HELP_INVESTIGATION_v1_0.md) **v1.2** — read it before acting on this plan.

---

## §0 — How to use this plan (the anti-drift protocol)

1. **Consult before acting, update after — in the same turn.** No increment is worked without reading
   its entry first, and no increment is left without its Status and Verification record written back.
   Both duties or neither.
2. **One place per fact.** This plan holds increment status. `CHANGELOG.md` holds what shipped.
   `docs/SESSION_RESUMPTION.md` gets a one-line pointer here and never a copy of the status.
3. **Nothing happens off-plan.** Work that is not an increment here is either added as a dated
   amendment (§8) or not done. Mid-flight findings are **recorded at once and then left alone**
   unless they are shown to make authorised work wrong.
4. **Every increment repeats the full cycle**, not just the easy half:
   > re-investigate → rollback point → smallest verifiable step → gate → dry run → wire → **real
   > working verification** → update this plan
5. **A check is written before the code it guards, and is proven to bite before it is trusted.**
   A check nobody has seen fail is not evidence. Bite-test transcripts are recorded in the increment.
6. **Status legend:** ☐ Planned · ◐ In progress · ✅ Done · ⊘ Blocked/Gated · ✖ Abandoned (with reason)

---

## §1 — What is being built (settled design)

A guided, interactive help layer inside InstaDesk, complementing the PDF manual and the existing Help
tab. It is **the real application, really driven** — not a mockup and not a simulation of the UI —
with a hard wall around every action that could disturb the user's desktop or destroy their work.

| Element | Decision | Ruled |
|---|---|---|
| Structure | A short mandatory **spine** (core loop, ~5–6 steps) plus **on-demand chapters**, bound to the eight existing `HELP_SECTIONS` ids | D-2, 2026-08-23 |
| Safety | The walkthrough never fires any action on the three forbidden lists (§2.1) | D-1 as amended by F-8, 2026-08-23 |
| Exit | Always available, provider-level, unconditional (REQ-1) | 2026-08-23 |
| Walled-off actions | Shown by **code-drawn schematic animation**, reusing the `LayoutPreviewOverlay` vocabulary. **No video ships in the installer.** | D-11 / REQ-2, 2026-08-23 |
| Working state | Snapshot before, restore on teardown, so *"the help changes nothing"* is a checkable invariant | ✅ D-12, 2026-08-23 |
| Layers touched | React UI + i18n **only**. No Rust, no `Program.cs`, no two-repo release sequencing | Investigation §5 |

---

## §2 — Governing invariants

### 2.1 The three forbidden lists (D-1 as amended by F-8)

The walkthrough must never call any of these. Enforced mechanically by I-2, not by this paragraph.

**Axis 1 — mutates the user's desktop (6):**
`launch` · `presets_run` · `quickpresets_run` · `snap_popup` · `arrange_all_windows` · `close_all_windows`

**Axis 2 — destroys or overwrites saved data without touching a window (5):**
`presets_delete` · `quickpresets_delete` · `presets_save` · `quickpresets_save` · `license_deactivate`

**Axis 3 — destructive UI-layer mutators that never reach Rust (5):**
`clearAllGrids` · `resizeMonitor` · `replaceGrid` · `clearGrid` · `pasteGrid`

**Permitted:** `monitors`, `capture_layout`, `identify_monitors` (read-only), plus in-app reversible
navigation and selection. `identify_monitors` is actively wanted — it paints a number on every
physical screen and is the best available affordance for the *"selecting monitors"* chapter.

> **Why this cannot be a guard on `api.ts` alone:** axis 3 never crosses into Rust. A single
> `clearAllGrids` call destroys the user's entire multi-monitor arrangement without touching the API
> surface. See F-8.

### 2.2 Standing project invariants that bind this work

1. Never `Stop-Process -Name Code`; never smoke-test `/launch` on `Code.exe` — VS Code hosts this session.
2. Ship via published signed releases only.
3. **The Sandbox gate is unconditional** — no promotion without a robot-free Sandbox pass.
4. `npm run build` is the real UI typecheck gate; `tsc --noEmit` is a no-op here.
5. English only in session; **EN/ES i18n parity** for every string-facing change.
6. Commit with explicit file paths, never `git add -A`.

---

## §3 — The gates, and how they become a mechanism (D-6 / F-9)

| Gate | Command | WHERE |
|---|---|---|
| UI | `npm run build` | `C:\FcXe Studios\Instadesk\instadesk-tauri\ui` |
| Rust | `cargo test --lib && cargo build --lib` | `…\src-tauri` — *unaffected by this feature; run only to prove nothing unrelated broke* |
| Sandbox (live) | `node src-tauri/scripts/sandbox.mjs --dev` | repo root |
| Sandbox (installer) | `node src-tauri/scripts/sandbox.mjs` | repo root |

**Baseline, measured on `303fce2` before any edit** (investigation §1): UI gate **exit 0**, 442
modules, 12.60 s, bundle **745.79 kB**. Rust gate **exit 0**, **8/8** tests. Pre-existing warnings —
stale browserslist, 745.79 kB chunk over the 500 kB threshold, `api.ts` static/dynamic import mix —
are **baseline noise and must never be attributed to this feature**.

**The enforcement mechanism.** The three new checks are wired as a **`prebuild`** script in
`ui/package.json`. npm runs `pre<script>` automatically before `<script>`, so they execute at three
points that already exist and are already mandatory:

1. every local `npm run build`;
2. every Sandbox build;
3. **every release-robot build** — `npx tauri build` → `beforeBuildCommand` (`npm --prefix ui run build`) → `prebuild`.

**Not husky.** Husky is installed but inert, and wiring it would run an undefined `npm test` on every
commit, breaking every commit in the repo (F-2).

**Stated limit, not over-claimed:** `prebuild` does not fire on `npm run build:check` or a bare
`vite build`, and does **not** gate commits — a broken state can be committed and is caught at the
next build. Weaker than a commit hook, and far safer.

---

## §4 — Rollback policy

- **Programme rollback point:** tag **`pre-assisted-help-v1`** at `303fce2` (I-0). The convention is
  established practice — `docs/RELEASING.md §7`, and 159 `pre-*` tags already exist.
- **Per-increment:** any increment marked **RISKY** below cuts its own `pre-assisted-help-<slug>` tag
  before its first edit.
- If an increment must be abandoned mid-flight, reset to its tag; record the abandonment in §8 with
  the reason. Never leave a half-wired increment as "done".

---

## §5 — Increment dashboard

| # | Increment | Risky? | Gate | Status |
|---|---|---|---|---|
| I-0 | Programme setup — rollback tag + records committed | no | git | ✅ `cc3c64d` |
| I-1 | **i18n parity check**, written first, proven to bite | no | build | ✅ |
| I-2 | **Tour safety check** (3 axes), written before any tour code | no | build | ✅ |
| I-3 | **Geometry spike** — throwaway, de-risks the scaled construct | no | Sandbox | ✅ PASS |
| I-4 | Anchor registry + anchor check (both directions), proven to bite | no | build | ✅ |
| I-5 | Anchor sweep across 8 components (~40–48 attributes) | **yes** | build + Sandbox | ☐ |
| I-6 | Tour engine + REQ-1 exit, incl. broken-step exit proof | **yes** | build + Sandbox | ☐ |
| I-7 | Lift `tab` / `sub` into `AppState` | **yes** | build + Sandbox | ☐ |
| I-8 | Snapshot / restore + the "changed nothing" assertion | **yes** | build + Sandbox | ☐ |
| I-9 | Schematic animation component (REQ-2) | no | build + Sandbox | ☐ |
| I-10 | Spine chapter — content, EN only | no | build + Sandbox | ☐ |
| I-11 | Remaining chapters — content, EN only | no | build + Sandbox | ☐ |
| I-12 | Entry points — Help "Show me", Settings replay, first-run offer | no | build + Sandbox | ☐ |
| I-13 | ES parity sweep (all new keys) | no | build | ☐ |
| I-14 | Telemetry events | no | build | ☐ |
| I-15 | Release v0.4.0 — Sandbox installer gate, CHANGELOG, bump, tag | **yes** | full | ☐ |

---

## §6 — The increments

### I-0 — Programme setup ☐

**Objective.** A safe place to return to, and the record in the repo before any code moves.
**Re-investigation.** Confirm `main` == `origin/main` and the tree carries only the known untracked entries.
**Steps.** Cut `pre-assisted-help-v1` at `303fce2`. Commit the investigation and this plan with explicit paths.
**Dry run.** n/a — no app code.
**Done when.** `git rev-parse pre-assisted-help-v1` resolves; both documents are committed; `git status --short` no longer lists `docs/workplans/`.
**Verification.** `git tag -l 'pre-assisted-help-v1'` returns the tag; `git log --oneline -1 -- docs/workplans/` shows the commit; `git diff --cached --stat` reviewed before the commit lands.

**Status. ✅ DONE 2026-08-23.** Verification record:

- Re-investigation: `main` == `origin/main` == `303fce2`, 0 ahead / 0 behind; tree carried only the
  three known untracked entries.
- Tag `pre-assisted-help-v1` created at `303fce2`; **verified by `git tag -l`**, not by `git rev-parse`
  — `rev-parse` on a missing ref echoes the argument back, which read as a false positive on the
  first attempt. Tag confirmed to point at the same commit as HEAD-at-the-time.
- Staged with **explicit paths**; `git diff --cached --stat` reviewed and confirmed **exactly 2 files,
  1128 insertions**. `docs/marketing/` and `ui/public/brand/FLCX Studios.png` confirmed still
  untracked and **not** swept in.
- ⚠ **Defect caught and corrected in-flight:** the first commit was made with PowerShell here-string
  syntax (`@'…'@`) inside **Bash**, which wrapped the message in literal `@` lines. Caught by reading
  the stored message back rather than trusting the commit's success. Amended (unpushed, so clean) via
  `git commit --amend -F <file>`; leading/trailing `@` removed, em-dash and co-author line verified
  intact, file count re-verified as 2. Final commit **`cc3c64d`**.
- Pushed to `origin/main`; `HEAD == origin/main == cc3c64d` verified after an explicit `git fetch`.
- Tag deliberately **kept local** per `docs/RELEASING.md §7`; confirmed **0** remote copies.
- **Lesson for later increments:** this session's Bash tool is POSIX `sh`, not PowerShell. Use a
  heredoc or `-F <file>` for any multi-line message. Recorded because the same mistake will otherwise
  recur at I-15's release commit.

---

### I-1 — i18n parity check, written first ☐

**Objective.** Close R-2 **before** a single string is added. This feature proposes the largest key
addition in the project's history and today parity is enforced only by a markdown checkbox (F-3).
**Re-investigation.** Re-derive the current leaf-key counts at the moment of writing — do not trust
the 471/471 recorded in the investigation.
**Steps.** `ui/scripts/check-i18n-parity.mjs` — compares EN and ES **leaf-key sets**, reports keys
missing on either side and any duplicate key, exits non-zero on failure. Wire as `prebuild`.
Read the JSON with Node's `fs`; **do not shell out to grep** (F-1).
**Dry run.** Run standalone against the untouched tree → expect PASS with the counts printed.
**Bite test (mandatory).** Delete one ES key → run → **expect FAIL naming that exact key** → restore
→ expect PASS. Then add a duplicate key → expect FAIL → restore. Record both transcripts here.
**Done when.** Check passes on the untouched tree; **both** bite tests recorded; the check is
observed running inside `npm run build` output, not merely assumed to be wired.
**Verification.** Paste of the failing run, the restored passing run, and the build output line showing `prebuild` executing.

**Status. ✅ DONE 2026-08-23.** Delivered: `ui/scripts/check-i18n-parity.mjs`, wired as
`checks` + `prebuild` in `ui/package.json`.

- **Re-investigation:** counts re-derived at the moment of writing — **EN 471 / ES 471, sets
  identical**. The investigation's figure was confirmed, not assumed.
- **Detects three failure classes**, not one: MISSING (key in one locale only), SHAPE (object in one,
  string in the other — `t()` returns an object and the UI renders nothing useful), and DUPLICATE.
  Duplicates required a **raw-text scanner**: `JSON.parse` silently keeps the last value for a
  repeated key, so a duplicate is *invisible* after parsing while one of the two strings is dead.
- **Dry run:** PASS on the untouched tree — recorded, and explicitly **not** accepted as evidence.
- **Bite tests — 3 of 3 caught** (harness took a SHA-256 backup and restored byte-for-byte):
  1. deleted `help.openManual` from ES → exit 1, `[es] missing key present in en: help.openManual`
  2. duplicated `common.cancel` → exit 1, `[es] duplicate key: common.cancel` — the case
     `JSON.parse` cannot see
  3. `help.sections` made a string instead of an object → exit 1, 17 problems reported
- **Control:** re-run on the restored file → PASS. `git status` and `git diff` confirm
  `ui/src/i18n/locales/` is **unmodified**.
- **The wiring was proven too, not just the script.** A script that exists but never runs would still
  print OK when invoked by hand. Deleted a key and ran `npm run build`: **exit 1, and `tsc`/`vite`
  never executed** — the gate stopped the build before compilation. Then restored byte-identically.
- **Bundle unchanged at 745.79 kB** — matches the baseline exactly; the check adds no runtime code.
- ⚠ **Instrument fault caught during verification:** the first `npm run build` appeared to fail with
  `EXIT=1`. It had not — `head -12` closed the pipe and killed npm with EPIPE. Re-run without
  truncation: **exit 0**. Suspect the instrument before the program.
**Status.** ✅

---

### I-2 — Tour safety check (three axes) ☐

**Objective.** Make D-1 a mechanism instead of a sentence. Written before any tour code exists, so
the instrument is proven before there is anything to measure.
**Re-investigation.** Re-derive the three lists from source — do not copy §2.1 blindly. The axis-1
list must be re-derived as a **transitive** closure with a sum check (the one-hop version was wrong: F-5b).
**Steps.** `ui/scripts/check-tour-safety.mjs` — scans every file under `ui/src/tour/**` and fails if
it references any name on the three lists, by import or by call. Wire as `prebuild`.
**Dry run.** Run against the untouched tree → passes trivially (no tour dir yet). **This proves nothing
on its own** and is explicitly not accepted as evidence.
**Bite test (mandatory, two cases).**
 1. Fixture calling `closeAllWindows` under the tour dir → **expect FAIL** → remove → PASS.
 2. Fixture calling `clearAllGrids` → **expect FAIL** — this is the axis-3 case an `api.ts`-only guard
    would miss, and is the specific defect F-8 exists to prevent.
**Done when.** Both bite tests recorded; check wired and observed in the build output.
**Verification.** Both failing transcripts, plus the passing run after removal.

**Status. ✅ DONE 2026-08-23.** Delivered: `ui/scripts/check-tour-safety.mjs`, added to `checks`.

- **Re-investigation:** the three lists were **re-derived from source**, not copied from §2.1.
  Transitive closure re-run independently: **32 commands, 9 reach the agent, 23 do not, 9 + 23 = 32 ✔**.
  Axis-2 filesystem operations re-confirmed at `backend.rs:616/630/745/758`.
- **Enforces 18 identifiers plus a bypass rule.** Direct `invoke(` is forbidden in walkthrough
  modules — without that, a step could reach a forbidden command straight past the identifier list.
- **One deliberate addition beyond the ruled list:** `licenseActivate`. The ruling named
  `license_deactivate` (frees a seat); activating **consumes** a seat from a limited device
  allowance, so a tutorial must not call it either. Flagged in the source comment as an addition.
- **Dry run:** passes with `0 walkthrough files found — NOTHING WAS CHECKED`. The wording is
  deliberate: a pass over nothing is not evidence, and the increment that creates `src/tour/` must
  see that line change.
- **Bite tests — 4 of 4 caught**, each naming file, line, identifier and axis:
  1. `closeAllWindows` (axis 1) → exit 1
  2. **`clearAllGrids` (axis 3) → exit 1** — the case that never reaches Rust and that an
     `api.ts`-level guard would not see. This is the specific defect F-8 exists to prevent.
  3. `presetsDelete` (axis 2) → exit 1
  4. `invoke('close_all_windows')` (bypass) → exit 1
- **CONTROL — and this one matters as much as the bites:** a harmless walkthrough file
  (`{ anchor: 'snap-button', title: 'This is Snap' }`) → **exit 0, "1 file scanned"**. A check
  nobody has seen *pass* on real content is as unproven as one nobody has seen fail; this proves it
  is not simply rejecting everything.
- **Fixture fully removed**; `ui/src/tour/` confirmed absent, tree clean.
- Observed running inside `npm run build` alongside the parity check; **exit 0, bundle 745.79 kB,
  unchanged from baseline**.
**Status.** ✅

---

### I-3 — Geometry spike (throwaway) ☐

**Objective.** Answer the riskiest unknown (R-1 / C-2) for the price of one disposable component,
before committing to ~45 anchors that assume it works.
**Re-investigation.** Re-read `App.tsx` `useBalancedFit`, and identify every inner scroll container
that can move an anchored element without the window moving.
**Steps.** A minimal overlay portaled to `document.body`, positioned from `getBoundingClientRect()`,
highlighting **one hardcoded element**. No registry, no steps, no content. **Explicitly disposable.**
**Dry run.** `sandbox.mjs --dev`. Exercise: default window · very wide · very tall/narrow · after a
live resize · with the right pane scrolled mid-list · light and dark theme.
**Done when.** The ring tracks its target in **every** listed case, or the failure mode is understood
and the approach is revised **before** I-5 spends effort on anchors.
**Verification.** Operator sees it live in the Sandbox and confirms. Then an explicit recorded
decision: keep the approach, or revise it — and the spike code is deleted either way.

**Status. ✅ PASS 2026-08-24. R-1 is retired.**

**DECISION: keep the approach.** Portal the overlay to `document.body`, position purely from
`getBoundingClientRect()`, reposition on `resize` + **capture-phase** `scroll` + a `ResizeObserver`.
**No scale arithmetic is needed anywhere in the real engine** — the rects already arrive as
post-transform viewport pixels.

**Evidence — final run (operator, live Sandbox):**

| Measure | Result |
|---|---|
| Recomputes | **698** |
| On-target | **696** |
| **Genuine mis-tracks (`WRONG-EL`)** | **0** |
| `null` at point | 0 |
| `outside` viewport (transient) | 2 — both explained, see below |
| Scale range exercised | **0.6406 → 1.0000, spread 0.3594** |

**Earlier runs in the same increment:** inner-container scroll tracked a **262.7 px** vertical
movement with `x`, `w` and `h` unchanged **to 0.1 px** (`y` 458.1 → 195.4); theme switch produced a
**byte-identical** rect (`x=193.9 y=636.5 w=98.3 h=27.9` in both Dark and Light).

**The two transients are explained, not waved through.** Captured samples:
`OUTSIDE centre=(117,572) viewport=820x544` and `OUTSIDE centre=(254,576) viewport=1094x552`.
In both, the centre's **y exceeded the viewport height** — the window got shorter mid-drag before
layout reflowed. Not a tracking failure.

⚠ **The instrument was defective first, and the defect was mine.** The first version counted a
single `OFF-TARGET` figure that conflated **three** causes with different meanings: wrong element
returned, `null` returned, and centre outside the viewport. It reported **1 failure in 744** that
could not be explained. Decomposing the counter showed the class was `outside` — a benign drag
transient. **This is the "an empty value asks HOW it became empty" defect built into the very
instrument meant to guard against it**, and it would have either falsely condemned a sound approach
or been waved through as noise. Neither is acceptable; the decomposition is what made the result
usable.

⚠ **Second instrument fault:** an earlier version drove the resize itself via `window.setSize()`,
which failed with `self-test error: undefined` — my `catch` read `.message` off a Tauri permission
rejection, which is a plain string, and **discarded the diagnosis**. Root cause:
`capabilities/default.json` grants only `core:default`, which excludes `core:window:allow-set-size`.
**The capability file was deliberately NOT widened** — adding a permission to the shipping app's
security surface so a throwaway diagnostic could run is the wrong trade. The drag stayed manual and
the *measurement* became automatic instead. Verified: `git diff src-tauri/capabilities/` empty.

**➜ Requirement carried to I-6:** the engine must treat *"anchor centre outside the viewport during
a resize"* as a **transient to retry**, not as a lost anchor. Without that it will log spurious
failures exactly when the user resizes the window mid-tour.

**➜ Confirmed by observation, not reasoning:** I-4 (registry) and I-7 (navigation) are **necessary,
not tidy.** With the ring pointed at a Settings control while the Apps tab was open, the spike showed
`NOT FOUND` — and could not distinguish *"that pane isn't open"* from *"the anchor was deleted"*.
That is finding F-4 reproduced live.

**Spike deleted.** `ui/src/components/__spike/` removed; `App.tsx`, `BottomControls.tsx` and
`SettingsPane.tsx` restored to their committed state via `git checkout --`. Verified: repo-wide grep
for `I-3 SPIKE|data-spike|GeometrySpike|__spike` returns **nothing**; `git status` clean; build green
with **bundle 745.79 kB, identical to baseline**.
**Status.** ✅

---

### I-4 — Anchor registry + anchor check ☐

**Objective.** Make F-4 tractable. A `null` from `querySelector` is ambiguous — *"not mounted yet"*
(wait) versus *"never existed"* (defect) — and the naive engine takes the reassuring reading and
narrates an empty rectangle while every gate stays green.
**Re-investigation.** Confirm no anchor naming collides with existing attributes.
**Steps.** A registry declaring, for each anchor: its id, its owning component, and **the UI state in
which it is expected to be reachable**. That declaration is what separates the two null causes.
Then `ui/scripts/check-tour-anchors.mjs`, enforcing **both directions**: every registry entry exists
in source, **and** every `data-tour` in source is registered — otherwise the two drift apart silently.
Wire as `prebuild`.
**Bite test (mandatory, two cases).** Rename one anchor in source → **expect FAIL** naming it.
Add an unregistered `data-tour` → **expect FAIL**. Restore → PASS.
**Done when.** Both directions bitten and recorded; check wired into the build.
**Verification.** Both failing transcripts plus the passing run.

**Status. ✅ DONE 2026-08-24.** Delivered: `ui/src/tour/anchors.json` (the registry),
`ui/src/tour/anchors.ts` (typed access + `anchorSelector`), `ui/scripts/check-tour-anchors.mjs`,
added to `checks`.

- **Re-investigation:** `data-tour` confirmed **unused** anywhere in `ui/src`; the attribute
  inventory re-derived as exactly **2** (`data-theme`, `id="insta-dialog-title"`), matching C-1.
- **Registry starts EMPTY, deliberately.** I-5 adds each anchor and its registry entry **together**,
  because the gate enforces both directions — one without the other fails the build. A pre-populated
  "planned" list would have been a set of entries the gate could not enforce yet, i.e. a note that
  can be ignored.
- **`reachableWhen` is mandatory, and that is the whole point.** It declares the UI state in which an
  anchor is expected to be in the DOM, which is what makes a `null` lookup **diagnosable**: *pane not
  open* (navigate and retry) versus *anchor deleted* (defect, fail loudly). This is the F-4
  ambiguity, reproduced live during I-3.
- **Data lives in JSON, not TS**, so the runtime and the gate read the **same file** and neither
  hand-parses TypeScript. Required adding `"resolveJsonModule": true` to `ui/tsconfig.app.json` —
  a deliberate one-line config change, recorded here, commented at the site.
- **Bite tests — 6 of 6 caught** (registry backed up under SHA-256, temporary fixture component,
  both restored in `finally`):
  1. **Direction A** — registered but absent from source → named the id and the component
  2. **Direction B** — `data-tour` in source, unregistered → named id, file and line
  3. **MOVED** — anchor present but in a *different* component than the registry claims → caught,
     with the message *"reachableWhen is now unverified"*. An existence-only check would have stayed
     green here while the registry quietly became a lie.
  4. `reachableWhen` missing → caught
  5. `reachableWhen.tab` not a real tab → caught
  6. duplicate id → caught
- **CONTROL:** a correct matched pair → **PASS** (`1 registered, 1 in source, both directions agree`).
  The gate is not simply rejecting everything.
- **Cleanup verified:** `__bite` fixture removed, `anchors.json` restored **byte-identical**, and the
  post-cleanup run returns to `0 registered, 0 in source`.
- ⚠ **Tooling trap recorded:** the first attempt wrote this script via a Bash heredoc, which
  **stripped every backslash**, silently corrupting every regex escape (`\\.tsx?$` → `\.tsx?$`,
  a syntax error). Written with the editor tool instead, then verified by grepping the escapes back
  out of the file. *This session's heredoc is not backslash-safe — use the editor tool for anything
  containing escapes.*
- **➜ I-2's prediction confirmed:** creating `src/tour/` flipped the safety gate from
  `0 walkthrough files found — NOTHING WAS CHECKED` to **`OK — 1 walkthrough file(s) scanned`**.
  The I-2 gate is now demonstrably inspecting real content rather than passing over nothing.
- Build green; **bundle 745.79 kB, unchanged** (nothing imports the registry yet, so it tree-shakes).
**Status.** ✅

---

### I-5 — Anchor sweep ☐ **RISKY** → tag `pre-assisted-help-anchors`

**Objective.** Add the ~40–48 `data-tour` attributes across 8 components. (The earlier "20–25"
estimate was low by about half — corrected in investigation C-1.)
**Re-investigation.** For **each** component, read it before editing. Attributes are inert, but the
edit touches 8 files including the two largest in the codebase (`RightPane.tsx` 1301 lines,
`LayoutsPane.tsx` 900).
**Steps.** One component per commit, not one sweep. Each commit: add attributes → gate → next.
**Dry run.** `sandbox.mjs --dev` after the sweep.
**Done when.** Anchor check green **in both directions**; `npm run build` green; **the UI is visually
identical to before** — attributes must change nothing.
**Verification.** Side-by-side confirmation in the Sandbox that no layout, spacing or behaviour moved.
Bundle size compared against the 745.79 kB baseline.
**Status.** ☐

---

### I-6 — Tour engine + REQ-1 exit ☐ **RISKY** → tag `pre-assisted-help-engine`

**Objective.** The overlay, the step model, and — as a first-class part of this increment, not a
follow-up — the always-available exit.
**Re-investigation.** Re-read the two portal precedents (`LayoutPreviewOverlay.tsx:105`,
`ConfirmDialog.tsx:138`) and the Escape binding at `ConfirmDialog.tsx:118-128`.
**Steps.** Provider portaled to body · spotlight + tooltip card · step navigation · reposition on
resize **and** inner scroll · z-index in the `z-[85]`–`z-[95]` band (above modals at `z-[80]`, below
`ConfirmDialog` at `z-[100]`) · anchor resolution that **distinguishes not-mounted from
not-declared** using the I-4 registry · REQ-1 exit: provider-level control (**R1.3 — never inside the
tooltip card**), Escape that yields to an open dialog (R1.2), unconditional with no confirm (R1.4),
single teardown path shared with normal completion (R1.7).
**Dry run.** `sandbox.mjs --dev` with two placeholder steps.
**Done when.** Every REQ-1 sub-requirement demonstrated, **including the broken-step case**.
**Verification — the part that actually counts.** Deliberately break a step's anchor. Confirm the tour
is visibly stuck. Confirm **the exit button and Escape both still work.** A happy-path exit test is
explicitly **not** accepted as evidence for REQ-1. Also confirm: with a `ConfirmDialog` open over the
tour, Escape closes the dialog and leaves the tour running.
**Status.** ☐

---

### I-7 — Lift `tab` / `sub` into AppState ☐ **RISKY** → tag `pre-assisted-help-navstate`

**Objective.** The tour cannot navigate today: `RightPane.tsx:60` and `:123` hold navigation in local
`useState`. Precedent favours lifting — `editingLayoutId` was lifted for exactly this reason, and an
event bus can command a tab change but can never report where the UI currently is.
**Re-investigation.** Map every consumer of both state values before moving them.
**Steps.** Move `tab` and `sub` into `AppState`; update consumers.
**Dry run.** Sandbox click-through of all four tabs and all three Apps sub-tabs.
**Done when.** Build green; tab state survives pane toggles; **the existing
`insta:open-layouts-tab` event still works** — this is the regression most likely to be missed.
**Verification.** Click "Manage QPs" in the left pane and confirm the Layouts tab still opens.
**Status.** ☐

---

### I-8 — Snapshot / restore ☐ **RISKY** → tag `pre-assisted-help-snapshot`

**Objective.** Make *"the interactive help changes nothing"* a **checkable invariant** rather than a
promise. The working grid is in-memory only (`AppState.tsx:451`, never persisted), so the exposure is
an unsaved in-progress arrangement — real, bounded, and worth protecting.
**Steps.** Snapshot `assignmentsByMonitor`, `argsOverridesByMonitor`, `gridSizeByMonitor`,
`currentMonitorId`, `selection` and the current tab before the first step; restore on the shared
teardown path (R1.7), so exit, Escape and normal completion all restore identically.
**Done when.** State before ≡ state after, for every chapter.
**Verification.** An **automated** deep-equality assertion — capture, run the chapter, exit, compare —
not an eyeball check.
**Status.** ☐ — **D-12 RULED ADOPTED 2026-08-23.** This supersedes REQ-1's original R1.5 wording
("nothing is reverted"); the amendment is recorded in the investigation §5A.

---

### I-9 — Schematic animation component (REQ-2) ☐

**Objective.** Show the four walled-off actions — Apply, Snap, Minimize all, Close all — without
performing them.
**Re-investigation.** Read `LayoutPreviewOverlay.tsx` in full and reuse its visual vocabulary
(per-monitor labelled boxes, grid lines from real cols/rows, apps in cells, responsive theme-aware
SVG) rather than inventing a second picture of the same thing.
**Steps.** A small animated panel driven by data, with all text in i18n keys.
**Dry run.** Sandbox `--dev`, light and dark.
**Done when.** The animation reads clearly at the panel's real size in both themes; bundle delta
measured against the 745.79 kB baseline and recorded.
**Verification.** Operator confirms the animation communicates the action. Safety check still green —
the animation must not import anything on the three lists.
**Status.** ☐

---

### I-10 — Spine chapter, EN only ☐

**Objective.** The core loop in 5–6 steps: pick a monitor → set the grid → assign an app → save as a
Layout → (schematic) what Apply does. **EN only**, deliberately, so the *feel* is judged before
translation is paid for.
**Done when.** The chapter runs start to finish; exit works at every step; safety check green.
**Verification.** Operator walks it in the Sandbox as a first-time user would.
**Status.** ☐

---

### I-11 — Remaining chapters, EN only ☐

**Objective.** Snap · Apps/URLs/Favorites · Layouts · Quick Presets · The bottom bar · Monitors &
grid sizes · Settings · Updates — bound to the eight existing `HELP_SECTIONS` ids so the manual, the
Help tab and the walkthrough share one taxonomy (D-4).
**Done when.** Every chapter runs; every chapter exits cleanly; anchor check green both directions.
**Verification.** Operator walks each chapter in the Sandbox.
**Status.** ☐

---

### I-12 — Entry points ☐

**Steps.** "Show me" button on each of the eight Help sections · "Replay the welcome tour" row in
Settings → General · first-run offer gated on a new storage key using `safeGet`/`safeSet`, following
the `instadesk.lastSeenVersion` baseline-on-first-run pattern (`main.tsx:20-26`).
**Note.** New key uses the `instadesk:` separator — the majority convention, 8 keys to 2 (D-9).
**Done when.** All three entry points work; the first-run offer appears exactly once and never again.
**Verification.** Clear the key in the Sandbox, relaunch, confirm the offer appears; dismiss,
relaunch, confirm it does not.
**Status.** ☐

---

### I-13 — ES parity sweep ☐

**Objective.** Translate every new key, once the EN text is frozen. A missing key does not crash —
i18next silently falls back to English — so a Spanish user would get an English tutorial with every
gate green. That is the exact reassuring failure the I-1 check exists to catch.
**Done when.** I-1's parity check passes with the full new key set; counts recorded.
**Verification.** Run the app in Spanish and walk the spine chapter end to end.
**Status.** ☐

---

### I-14 — Telemetry ☐

**Steps.** `tour_started {chapter}` · `tour_step {chapter, index}` · `tour_completed {chapter}` ·
`tour_abandoned {chapter, atStep}`. `snake_case`, matching the 10 existing event names. Inert without
keys; honours the existing opt-out automatically.
**Rationale.** `tour_abandoned {atStep}` is the only way we will ever learn **which step loses people**.
**Done when.** Events fire in the right order and nothing is emitted when opted out.
**Status.** ☐

---

### I-15 — Release v0.4.0 ☐ **RISKY**

**Pre-flight.** All gates green · all three checks green and each with a recorded bite test ·
CHANGELOG `[Unreleased]` written in user-facing language · **Sandbox installer gate passed**
(unconditional — no rationalising a skip; we were caught skipping it on 0.2.1).
**Steps.** `bump-version.mjs 0.4.0 --dry-run`, then for real → commit with explicit paths →
`git tag v0.4.0 && git push origin v0.4.0`.
**No WinAgent push needed** — `Program.cs` is untouched, so the two-repo sequencing trap does not apply.
**Verification.** `curl` the live `latest.json` shows `0.4.0`; `gh release view v0.4.0` shows
`isPrerelease:false` and 3 assets.
**Status.** ☐

---

## §7 — Open decisions

| ID | Question | Status |
|---|---|---|
| **D-12** | Snapshot/restore on teardown — does the walkthrough put everything back exactly as it found it? | ✅ **RULED: ADOPTED** 2026-08-23. I-8 unblocked. |
| **D-8** | Is a first-run auto-offer shown at all, or is the walkthrough purely on-demand? | ✅ **RULED: offer is shown** 2026-08-23 (I-12) |
| **D-7** | Does the walkthrough retire the manual's screenshot backlog, or add to it? | ⏳ Operator's; **parked**; blocks nothing here |
| **D-10** | Is the `layoutBuilder.ts` NUL byte (F-1) scheduled as its own increment, or left parked? | ⏳ Operator's; **parked, not forgotten**; blocks nothing |

---

## §8 — Amendment log

| Date | Change | Reason |
|---|---|---|
| 2026-08-23 | Plan created at v1.0 from investigation v1.2 | Phase 1 of the agreed method |
| 2026-08-23 | D-12 ruled ADOPTED → I-8 unblocked (⊘ → ☐); REQ-1 **R1.5 amended** — the walkthrough now restores the working state instead of leaving it as-is | Operator ruling. Makes *"the help changes nothing"* mechanically checkable rather than promised |
| 2026-08-23 | D-8 ruled — the first-run offer is shown | Operator ruling |

---

*Consult before acting. Update after — same turn.*

# Assisted Interactive Help — Phase 0 Deep Investigation

**Document type:** investigation (evidence only — no plan, no design commitments)
**Version:** v1.2
**Date:** 2026-08-23 (v1.0 same day; **v1.1** records the operator's rulings on D-1 / D-2, adds
requirement REQ-1 in §5A, and adds finding F-8 with the second and third safety axes in §4.4;
**v1.2** records the D-11 presentation-medium ruling, adds REQ-2, and resolves D-6 via finding F-9)
**Repo:** `C:\FcXe Studios\Instadesk\instadesk-tauri` (app repo, remote `FCCXE/InstaDesk-V2.0`)
**Baseline commit:** `303fce2` on `main` (= `origin/main`, 0 ahead / 0 behind)
**Released version at investigation time:** **v0.3.0** (tag `v0.3.0` = `b7aa131`)

---

## §0 — What this document is, and is not

This is **Phase 0** of the three-phase method ratified for this work:

> **Phase 0 — Deep investigation** (this document) → **Phase 1 — Work plan** → **Phase 2 — Implementation**,
> where each implementation increment repeats the cycle in miniature: investigate again →
> rollback point → smallest verifiable step → dry run → wire → real working verification →
> update the plan in the same turn.

**This document contains evidence, not decisions.** Every factual claim below was produced by
running a command against the live repository on the date above, and the command is named so the
claim can be re-derived. Where a claim could not be established, it is recorded as an open question
in §9 rather than resolved by assumption.

**This document is not the work plan.** It deliberately proposes no increments, no sequence and no
schedule. Those belong to Phase 1, which must be written *from* this evidence.

**Scope of the objective under investigation** (operator's words, 2026-08-23):

> An assisted interactive help for InstaDesk that guides any user through the main steps required to
> use the app correctly — a visual interactive walkthrough teaching the Snap button, adding apps,
> creating layouts, building Quick Presets, selecting monitors, grid options, what the bottom-bar
> buttons do, how the Settings pane works, how upgrades are received and installed. It complements
> the user manual.

---

## §1 — Baseline: the known-good state, measured before anything was touched

A baseline is only useful if it is taken **before** the first edit. Both gates were run on the
untouched tree at commit `303fce2`.

### 1.1 UI gate — PASS

**WHERE:** `C:\FcXe Studios\Instadesk\instadesk-tauri\ui`
**Command:** `npm run build` (= `tsc -b && vite build`)
**Result:** **exit 0**, 442 modules transformed, built in 12.60 s.

Pre-existing warnings recorded so they are **never later attributed to this feature**:

| Warning | Detail |
|---|---|
| Browserslist data stale | caniuse-lite is 11 months old |
| Chunk size | `dist/assets/index-*.js` = **745.79 kB** (> 500 kB warning threshold), gzip 233.31 kB |
| Import-mode mix | `services/api.ts` is dynamically imported by `services/telemetry.ts` but statically imported by 16 other modules, so it will not be split into its own chunk |

The chunk-size warning matters to this feature: a walkthrough adds code **and** a large block of
strings to the same bundle. The baseline number `745.79 kB` is recorded so the increase is
measurable rather than guessed.

### 1.2 Rust gate — PASS

**WHERE:** `C:\FcXe Studios\Instadesk\instadesk-tauri\src-tauri`
**Command:** `cargo test --lib` then `cargo build --lib`
**Result:** **exit 0** both. **8 tests, 8 passed, 0 failed, 0 ignored.**

The gate is not vacuous — it runs real tests. But their location matters:

| File | `#[test]` count |
|---|---|
| `src-tauri/src/backend.rs` | 5 |
| `src-tauri/src/license.rs` | 3 |
| `src-tauri/src/lib.rs` | 0 |
| `src-tauri/src/main.rs` | 0 |

**Consequence:** all 8 tests exercise the Rust backend and licensing. **None exercises any UI
behaviour.** The Rust gate is therefore *not* evidence for anything in this feature, and must not be
cited as such. If the walkthrough stays UI-only (see §5), the Rust gate's role is limited to proving
we did not break something unrelated.

### 1.3 Working tree — clean

`git status --short` reports exactly two untracked entries, both pre-existing and unrelated:
`docs/marketing/` and `ui/public/brand/FLCX Studios.png`. Build artifacts (`dist/`,
`src-tauri/target/`) are gitignored, confirmed against `.gitignore`, so running the baseline gates
did not dirty the tree.

### 1.4 Rollback mechanism — exists and is heavily used

`docs/RELEASING.md §7` defines two tag classes:

- **`vX.Y.Z`** — the version record. One per release, never moved except a deliberate rollback re-point.
- **`pre-<slug>`** — *"disposable local safety markers made before risky edits"*, explicitly **not**
  the record, prunable, may be pushed when a rollback point needs sharing.

`git tag -l 'pre-*'` returns **159 tags**. The convention is established practice in this repo, not
something this programme needs to invent.

---

## §2 — The existing help estate (what must not be duplicated)

Three surfaces already exist or partly exist. The walkthrough is the fourth, and the risk is
**quadruplication of the same sentences in four places**.

| # | Surface | Where | State (verified) |
|---|---|---|---|
| 1 | **PDF manual** | `docs/manual/manual.en.html`, `manual.es.html` (284 lines each) → built by `docs/manual/build-manual.mjs` (headless Chrome/Edge `--print-to-pdf`) → `ui/public/manual/InstaDesk-Manual-{EN,ES}.pdf` | Text complete. **Screenshots are still dashed `<div class="shot-ph">` placeholders**; `docs/manual/README.md` defers them to "UI freeze (~Step 2.4)" |
| 2 | **In-app Help tab** | `HelpPane`, `ui/src/components/RightPane.tsx:1022-1190` | Live. 8 collapsible sections + Open-manual button + feedback form + version footer |
| 3 | **Tooltips** | `title=` attributes throughout | Live, ad hoc, not systematic |
| 4 | **Interactive walkthrough** | — | **Does not exist. This programme.** |

### 2.1 The eight existing Help sections

Declared as `HELP_SECTIONS` at `RightPane.tsx:1027-1036`, each mapping to
`help.sections.<id>.title` / `.body` in both locale files:

`quickStart` · `grid` · `apps` · `layouts` · `quickPresets` · `snap` · `monitorsSettings` · `troubleshooting`

**This is the single most useful structural finding in the investigation.** The operator's feature
list maps almost one-to-one onto these eight existing ids. Binding walkthrough chapters to the same
ids would give the project one topic taxonomy instead of four, and makes the Help tab the natural
launch surface. Whether to do so is a Phase 1 decision (§9, D-4), but the option exists at near-zero
structural cost and it is the only identified mitigation for the quadruplication risk.

### 2.2 A search of the UI found no existing walkthrough machinery

Grep across `ui/src` for `onboard|tour|walkthrough|tutorial|firstRun|coachmark` returns **no
implementation** — only the word "manual" in unrelated comments and the `help.*` i18n keys. Nothing
is being rebuilt; this is greenfield within an existing app.

---

## §3 — Technical constraints established from the code

### C-1 — The UI has essentially no anchors

A spotlight walkthrough must hold a stable handle on every element it points at. A sweep of **every**
`.tsx` file for `data-*` attributes and `id="…"` returns exactly **two** results in the whole
application:

- `data-theme` — `ui/src/state/ThemeProvider.tsx` (theme root)
- `id="insta-dialog-title"` — `ui/src/components/common/ConfirmDialog.tsx:152` (aria label)

Neither is usable as a tour anchor. **Every anchor this feature needs must be added.** Targeting
Tailwind class strings instead is not viable — they are restyled routinely and carry no semantics.

**Correction to an earlier estimate.** In the pre-investigation scoping pass I estimated
"~20–25 anchors across 8 components." Enumerating the actual interactive elements per the operator's
topic list gives a materially higher number — roughly **40–48** for full chapter coverage, against
roughly **10** for a minimal core-loop spine. The earlier figure was low by about half. The exact
list is a Phase 1 deliverable; the correction is recorded here because it changes the effort estimate.

Provisional per-component distribution (to be fixed, not assumed, in Phase 1):

| Component | File | Approx. anchors |
|---|---|---|
| TopChrome | `ui/src/components/TopChrome.tsx` | 2 |
| MonitorSelector | `ui/src/components/MonitorSelector.tsx` | 7 |
| WorkspaceGrid | `ui/src/components/WorkspaceGrid.tsx` | 3 |
| RightPane (tabs + Apps pane) | `ui/src/components/RightPane.tsx` | 8 |
| LayoutsPane | `ui/src/components/layouts/LayoutsPane.tsx` | 7 |
| QuickPresetsManager | `ui/src/components/quickpresets/QuickPresetsManager.tsx` | 2 |
| SettingsPane | `ui/src/components/settings/SettingsPane.tsx` | 9 |
| BottomControls | `ui/src/components/BottomControls.tsx` | 8 |

### C-2 — The scaled construct governs all overlay geometry

`ui/src/App.tsx` renders the entire application inside a fixed **1280 × 820** "construct" div under
`transform: scale(s)`, `transformOrigin: 'center center'`, centred in the window. The scale factor is
recomputed on **every** `resize` event by `useBalancedFit()` (`App.tsx:46-66`): construct height is
pinned to 820, width is fluid between `DESIGN_AR` and `MAX_AR` (currently equal, both ≈ 1.561), then
the whole thing is uniformly scaled to fit.

Consequences for any highlight overlay:

1. `getBoundingClientRect()` returns **post-transform viewport pixels**. An overlay portaled to
   `document.body` and positioned from those rects is correct with no scale maths at all. An overlay
   rendered *inside* the construct inherits the scale and needs construct-space coordinates. The
   first approach is strictly simpler and is the one the existing code already uses.
2. The overlay must recompute on **window resize** (scale changes) **and** on **scroll of inner
   containers**. The right pane, the left pane and several sub-panes each have their own
   `overflow-y-auto`, so an anchored element can move without the window moving.
3. Two working precedents exist in-repo and should be mirrored rather than re-derived:
   - `LayoutPreviewOverlay.tsx:105` — `createPortal(…, document.body)` with `fixed inset-0`
   - `ConfirmDialog.tsx:138` — rendered as a **sibling of `{children}`** at provider level; because
     `ConfirmProvider` wraps `<App/>` in `main.tsx`, its `fixed inset-0` is already outside the
     transform

This is assessed as the **highest-probability source of visual defects** in the whole feature
("the ring is in the wrong place").

### C-3 — z-index ceiling

Values in use across the UI: `z-10`, `z-50` (LayoutPreviewOverlay), `z-[70]`, `z-[80]` (modals),
`z-[100]` (ConfirmDialog).

A walkthrough overlay must sit **above** panes and modals but **below** confirmation dialogs — a
confirm must never be obscured by a tutorial. That places it in the `z-[85]`–`z-[95]` band. Exact
value is a Phase 1 decision (§9, D-5).

### C-4 — Navigation state is component-local, so the tour cannot currently navigate

| State | Location | Consequence |
|---|---|---|
| Main tab (`Apps`/`Layouts`/`Settings`/`Help`) | `RightPane.tsx:60` — local `useState` | A tour cannot open the Layouts tab |
| Apps sub-tab (`URLs`/`Apps`/`Favorites`) | `RightPane.tsx:123` — local `useState` | A tour cannot open the URLs sub-tab |
| QuickPresetsManager view mode | `QuickPresetsManager.tsx:34` — local `useState` | A tour cannot open the QP create form |

One escape hatch already exists: the left pane dispatches `window.dispatchEvent(new Event(
'insta:open-layouts-tab'))` and `RightPane.tsx:62-66` listens for it. So a window-event bus is
precedented — but it is write-only: it can *command* a tab change and can never *read* where the UI
currently is, which a tour needs in order to verify a step completed.

Relevant prior lesson recorded on this project: conditional rendering unmounts panes and destroys
local state, which is why `editingLayoutId` was already lifted into `AppState` (see the comment at
`RightPane.tsx`/`LayoutsPane.tsx:112`). The same argument applies here. Lifting versus event-bus is a
Phase 1 decision (§9, D-3), but the precedent points one way.

### C-5 — i18n is at exact parity today, and this feature is the largest parity risk to date

Verified by script over both locale files: `en.json` = **471 leaf keys**, `es.json` = **471 leaf
keys**, identical top-level sections (20 each). Bootstrap is `ui/src/i18n/index.ts` (i18next +
react-i18next, `lng` persisted to `instadesk:lang`, `fallbackLng: 'en'`).

A walkthrough of the scope described implies roughly **60–90 new leaf keys per locale**, i.e.
**120–180 additions** — a **13–19 % increase** over the current corpus, in one feature.

**There is no automated parity check.** A search of the repo for any parity/locale test found
exactly one hit: `docs/RELEASING.md:39`, a **manual checklist line** —
*"[ ] i18n parity + zero duplicate keys (if locales changed)."* That is a human checkbox, not a
mechanism. See F-3.

### C-6 — Persistence namespace

localStorage keys currently in use (swept across `ui/src`):

`instadesk:browsers` · `instadesk:defaultGridSize` · `instadesk:gridSizeByMonitor` ·
`instadesk:installId` · `instadesk:lang` · `instadesk:telemetryOptOut` · `instadesk:theme` ·
`instadesk:windowMargin` · `instadesk.lastSeenVersion` · `instadesk.update.dismissed`

Note the corpus uses **two separators inconsistently** — `instadesk:` (8 keys) and `instadesk.`
(2 keys). Any new key must pick one deliberately rather than by copy-paste. `storage.ts` provides
`safeGet`/`safeSet` with shape validation and an in-memory fallback; the first-run flag should use
it rather than raw `localStorage`.

A first-run flag has a direct precedent: `main.tsx:20-26` compares `instadesk.lastSeenVersion`
against the running version to emit `update_applied` exactly once per version change, recording a
baseline on first run so no false event fires. That "record baseline on first run, act only on
change" shape is exactly what a first-run tour offer needs.

### C-7 — Telemetry seam

`ui/src/services/telemetry.ts` is the only module importing vendor SDKs; everything else calls
`track()` / `captureError()` / `identifyInstall()`. It is **inert without build-time keys** and
honours a persisted opt-out (`instadesk:telemetryOptOut`), mirrored to the native crash reporter.

Existing event names (10): `app_opened`, `arrange_all_windows`, `close_all_windows`,
`feedback_submitted`, `layout_applied`, `layout_saved`, `quickpreset_applied`, `snap_used`,
`update_applied`, `update_banner_install`. Convention is `snake_case`, verb-ish, with a small props
object. Any walkthrough events should follow it.

---

## §4 — The safety boundary, computed rather than assumed

The proposed governing rule for this feature is that **the walkthrough must never mutate the user's
real desktop**. A prohibition of that kind is worthless without a **computed reach set** — the
explicit, provable list of what is forbidden. Guessing the list is how such rules fail.

### 4.1 The authoritative command surface

Derived from the Rust side (`#[tauri::command]` definitions across `src-tauri/src/*.rs`), because
the Rust side is authoritative and the UI side is a caller:

**32 commands total** — `backend.rs` 28, `license.rs` 3, `lib.rs` 1. **28 + 3 + 1 = 32 ✔**

### 4.2 Transitive reach set

Five helpers actually invoke the WinAgent sidecar: `agent_command`, `run_agent`, `run_agent_raw`,
`spawn_agent_detached`, `spawn_agent_child`. Commands were classified by **transitive** closure over
the call graph, not by direct call.

**Reaches the WinAgent — 9:**
`arrange_all_windows` · `capture_layout` · `close_all_windows` · `identify_monitors` · `launch` ·
`monitors` · `presets_run` · `quickpresets_run` · `snap_popup`

**Does not reach the WinAgent — 23:**
`autostart_is_enabled` · `autostart_set` · `browse` · `get_dragsnap_enabled` · `health` ·
`license_activate` · `license_deactivate` · `license_status` · `list_browsers` · `open_manual` ·
`pick_exe` · `presets_delete` · `presets_get` · `presets_list` · `presets_save` ·
`quickpresets_delete` · `quickpresets_get` · `quickpresets_list` · `quickpresets_save` ·
`set_dragsnap_enabled` · `set_hotkey` · `set_snap_margin` · `set_telemetry_optout`

**SUM CHECK: 9 + 23 = 32 ✔** (matches the authoritative total)

### 4.3 The second axis: reaching the agent ≠ mutating the desktop

Of the 9 that reach the agent, only 6 change anything the user can lose:

| Command | Effect | Tour may call? |
|---|---|---|
| `monitors` | enumerates displays | **read-only** — already called continuously by `AppState` |
| `capture_layout` | reads open windows and their positions | **read-only** |
| `identify_monitors` | shows transient numbered overlays on each screen | **visible, non-destructive, self-dismissing** |
| `launch` | starts programs, positions windows | **mutating — forbidden** |
| `presets_run` | applies a Layout: launches and tiles everything | **mutating — forbidden** |
| `quickpresets_run` | applies a bundle of Layouts | **mutating — forbidden** |
| `snap_popup` | spawns the native overlay and moves a window | **mutating — forbidden** |
| `arrange_all_windows` | minimizes/restores every window | **mutating — forbidden** |
| `close_all_windows` | closes every window | **mutating and destructive — forbidden** |

**Design consequence worth carrying to Phase 1:** `identify_monitors` is not merely permissible, it
is arguably the single best affordance in the app for the *"how to select monitors"* chapter — it
puts a big number on every physical screen. The investigation surfaced it as an asset, not just a
hazard.

### 4.4 — The reach set has three axes, not one (added v1.1)

§4.2 classified commands by **whether they reach the WinAgent**. That axis is correct but **not
sufficient as a safety boundary**, and framing the prohibition around it alone would have left the
walkthrough free to destroy the user's saved work without touching a single window.

**Axis 2 — destroys or overwrites user data, without reaching the agent.** Verified by scanning
`backend.rs` for filesystem operations inside each command, and `license.rs` for the licence path.
Every one of these sits in the "safe 23" of §4.2:

| Command | Operation | Consequence |
|---|---|---|
| `presets_delete` | `fs::remove_file` (`backend.rs:630`) | **permanently deletes a saved Layout** |
| `quickpresets_delete` | `fs::remove_file` (`backend.rs:758`) | **permanently deletes a saved Quick Preset** |
| `presets_save` | `fs::write` (`backend.rs:616`) | **overwrites** a Layout slot |
| `quickpresets_save` | `fs::write` (`backend.rs:745`) | **overwrites** a Quick Preset slot |
| `license_deactivate` | `clear_license()` (`license.rs:252-254`) | **frees the device's licence seat** |

Reversible preference writes, which a tour still must not flip silently: `autostart_set`,
`set_dragsnap_enabled`, `set_snap_margin`, `set_hotkey`, `set_telemetry_optout`.

**Axis 3 — destructive UI-layer mutators that never reach Rust at all**, and are therefore absent
from the 32-command surface entirely (`ui/src/state/AppState.tsx`):

| Mutator | Line | Consequence |
|---|---|---|
| `clearAllGrids` | 637-641 | wipes **every** monitor's assignments, args and grid sizes |
| `resizeMonitor` | 565-571 | wipes that monitor's assignments **and** args overrides |
| `replaceGrid` | 653+ | clears every cell outside the supplied map |
| `clearGrid` / `pasteGrid` | 622 / 646 | clear or overwrite the current grid |

**The load-bearing consequence for Phase 1:** the prohibition **cannot be enforced at the `api.ts`
boundary alone.** A check that only guards the Tauri command surface would police axis 1 and axis 2
and miss `clearAllGrids` — a single call that destroys the user's entire multi-monitor arrangement —
because it never crosses into Rust. The enforcement check must cover all three lists.

---

## §5 — Layers this feature touches

Based on §3 and §4, and assuming the mutation prohibition holds:

| Layer | Touched? | Consequence |
|---|---|---|
| React UI (`ui/src`) | **Yes** — all of it | `npm run build` is the governing gate |
| i18n locales | **Yes** — heavily (§C-5) | EN/ES parity is the largest single risk |
| Rust backend (`src-tauri`) | **No** | No new commands needed; the 3 read-only ones already exist |
| C# WinAgent (`Program.cs`) | **No** | **The two-repo release sequencing trap does not apply** |
| Release robot | **No** | Standard tag-push release |

**This is a single-repo, UI-only feature.** That materially lowers its release risk compared with
v0.2.0/v0.3.0, both of which changed `Program.cs` and required the WinAgent repo to be pushed first.

---

## §5A — Requirements added by operator ruling (added v1.1)

### REQ-1 — The exit is always available

**Operator requirement, 2026-08-23:** *"an always-on exit for the user to exit the interactive
help."* Recorded as a **correctness requirement, not a convenience.** A walkthrough that can leave a
user unable to get out is worse than no walkthrough, and the earlier specification omitted it — the
first-run offer was described as "skippable", but nothing was specified for a **running** tour.

| # | Requirement |
|---|---|
| **R1.1** | The exit control is visible on **every** step, first and last included. No step, chapter or state may suppress it. |
| **R1.2** | **Esc always exits**, with one ordering rule: `ConfirmDialog` already binds Escape at window level (`ConfirmDialog.tsx:118-128`). While a confirmation dialog is open above the tour, Escape must close **the dialog**, not the tour. The tour's handler yields while a dialog is open. |
| **R1.3** | **The exit control must NOT be rendered inside the tooltip card.** See rationale below. |
| **R1.4** | Exit is **unconditional and immediate** — no "are you sure?". Under D-1 the tour leaves nothing behind that needs protecting, and a confirm-on-exit is precisely what makes a user feel trapped. |
| **R1.5** | Exit restores a fully usable app: overlay removed, no dim layer, no disabled controls, no captured focus, no locked scroll. ⚠ **AMENDED 2026-08-23 by the D-12 ruling:** the original wording ("left as-is — nothing is reverted") is **superseded**. The walkthrough now **restores the working state it found** — assignments, args overrides, grid sizes, selected monitor, current tab — on every teardown route. Rationale: it makes *"the help changes nothing"* a mechanically checkable invariant instead of a promise, and it protects an unsaved in-progress arrangement from being clobbered by a lesson. |
| **R1.6** | Exit is reachable **by keyboard alone** and carries an accessible label. |
| **R1.7** | Normal completion of a chapter and user-initiated exit run **the same teardown path**, so the two cannot diverge and leave residue on one route only. |

**Rationale for R1.3 — the difference between "there is an exit button" and "there is always an
exit."** An exit rendered inside the step tooltip inherits every failure mode of the tooltip:

- the step's anchor fails to resolve, so the card never renders (F-4);
- the card positions off-screen under the scaled construct or an inner scroll (C-2);
- the step throws, and React unmounts the card.

In each case the button vanishes at exactly the moment the user most needs it — a broken tour is
precisely when someone wants out. The exit must therefore be a **viewport-fixed control rendered at
provider level, independent of step state**, so that it survives a step that has failed.

**Verification obligation (R1.7 + F-4):** the exit must be proven in the **broken-step** case, not
only the happy path. Deliberately break a step's anchor, confirm the tour is visibly stuck, and
confirm the exit and Escape still work. A happy-path exit test is not evidence for this requirement.

### REQ-2 — Walled-off actions are shown by code-drawn schematic animation, not video (added v1.2)

**Problem this solves.** D-1 forbids the walkthrough from performing the four actions that produce
InstaDesk's actual payoff — Apply a Layout, Snap, Minimize all, Close all. All four take effect
**outside the app window**, across the user's physical monitors. A live spotlight can therefore only
*describe* them. The product's most compelling behaviour is exactly the part the tour cannot perform.

**Options considered.** Recorded video clips versus code-drawn schematic animation.

**Ruling (operator, 2026-08-23): schematic animation. No video files ship in the installer.**

| Criterion | Video clips | Schematic animation |
|---|---|---|
| Detected when stale | **Never** — not diffable, lintable or type-checkable | Follows a restyle automatically; source passes the UI gate |
| EN/ES | two recordings (double rot) or captions that can drift | text stays in i18n keys, covered by the parity check |
| Size on a 69 MB installer | **+10–30 MB**, re-downloaded on every auto-update | kilobytes |
| Update cost | requires the operator's physical multi-monitor rig | a code edit |
| Precedent in repo | none | **`LayoutPreviewOverlay` already does it** |

**Existing machinery to reuse.** `LayoutPreviewOverlay.tsx` already renders per-monitor labelled
boxes (M1, M2…), grid lines derived from the real cols/rows, and app placement in cells, as a
responsive theme-aware SVG (`viewBox`, `preserveAspectRatio="xMidYMid meet"`). Users already meet
this vocabulary via "Show content" on every Layout card, so the animation reuses a picture they
already recognise rather than introducing a new one.

**Where video does belong:** the website and the commercial handout
(`docs/marketing/InstaDesk-Commercial-Handout.md`), where staleness is visible to us, re-recording is
optional, and the material does sales work. **Not in the shipped binary.**

**Carried but NOT yet ruled — snapshot/restore.** The recommendation that the walkthrough snapshots
the working state (assignments, args overrides, grid sizes, selected monitor, current tab) before it
begins and restores it on teardown was put to the operator on 2026-08-23 and **superseded in
conversation by the D-11 question before a ruling was given**. It is carried into the Phase 1 plan as
the working assumption because it makes *"the help changes nothing"* a checkable invariant, but it is
recorded here as **awaiting confirmation**, not as ruled.

---

## §6 — Findings

### F-1 — `layoutBuilder.ts` contains a literal NUL byte, and grep silently skips the file

**Evidence:** `ui/src/services/layoutBuilder.ts` is 20 983 bytes and contains a `0x00` byte at
offset **6123**, which is **line 146**. `file` reports it as `data`. The file still decodes as valid
UTF-8, and `npm run build` passes with it (exit 0, this session).

**Cause:** the intended source text was the two-character escape `\0`. A raw NUL was written instead.
Context (line 144-147):

```
// `${app}\0${args}` to disambiguate when args is empty vs. when it's omitted.
function regionGroupKey(app: string, args: string): string {
  return `${app}<LITERAL 0x00>${args}`;
}
```

**Runtime impact: none.** A template literal containing a raw NUL produces the same string as `\0`,
so `regionGroupKey` behaves as designed.

**Tooling impact: real, and it already affected this investigation.** GNU grep classifies the file as
binary and reports only `Binary file … matches` without showing content, unless `-a`/`--text` is
passed. My first localStorage sweep hit exactly this. **Any grep-based audit of `ui/src` silently
excludes this file** — including the anchor-coverage check and any i18n key sweep this programme
intends to build.

**Disposition: RECORDED, NOT FIXED.** Fixing it is a separate change requiring its own investigation
and increment; it is outside the authorised scope of this programme. It is registered here so that
(a) every check this programme writes must pass `--text`/`-a` or be proven to read the file, and
(b) the operator can decide separately whether to schedule the one-character fix.

### F-2 — The commit-time gate is installed but has never run

**Evidence:**
- `ui/package.json` declares `husky` (devDependency) and a `prepare: "husky"` script, and
  `ui/node_modules/husky` is installed.
- `ui/.husky/pre-commit` exists but is **10 bytes** and contains husky's untouched default template:
  `npm test` (with a CRLF line ending).
- `git config --get core.hooksPath` is **unset** (exit 1).
- `.git/hooks/` contains **no** non-sample hooks.

**Conclusion: no hook fires on any commit in this repository.** The gate exists on paper only.

**Second-order hazard:** naively wiring husky would make `npm test` run on every commit. No `test`
script is defined in `ui/package.json`, so **every commit in the repo would begin to fail.** "Just
add a pre-commit hook" is therefore not a free action and must not be planned as one.

### F-3 — i18n parity is enforced by a human checkbox, not a mechanism

**Evidence:** the only parity reference anywhere in the repo is `docs/RELEASING.md:39` —
`- [ ] i18n parity + zero duplicate keys (if locales changed).` No script, no test, no CI step.

**Why it matters here:** parity currently holds (471 = 471) and has held through 30+ releases, so the
manual checkbox has been adequate for small changes. This feature proposes the largest single-change
key addition in the project's history (§C-5). A missed key does not crash — i18next falls back to
English — so a Spanish user would silently get an English tutorial step, and every gate would stay
green. This is the classic reassuring failure.

### F-4 — A null anchor is ambiguous, and the reassuring reading is the wrong one

**Evidence:** this is an inherent property of the mechanism the feature requires. A step resolves its
target with `document.querySelector('[data-tour="x"]')`, which returns `null` for **two causes with
different remedies**:

| Cause | Correct remedy |
|---|---|
| The element has not mounted yet (tab still switching, pane still loading) | wait and retry |
| The anchor was renamed, removed, or never added | **defect — fail loudly** |

A naive engine takes the reassuring reading, retries, times out, and either skips the step or centres
the tooltip on nothing. The tour keeps running, confidently narrating an empty rectangle. **No gate
turns red.**

**Consequence for Phase 1:** the anchor resolver must distinguish the two cases by design (e.g. an
anchor registry declaring which anchors are expected to exist in which UI state, so "not mounted but
expected here" is separable from "not declared anywhere"). And the check that verifies anchor
coverage must be **proven to bite** — deliberately break one anchor and confirm the check fails —
**before** the anchor sweep is trusted. A check nobody has seen fail is not evidence.

### F-5 — Two of this investigation's own sweeps under-reported; the method caught both

Recorded because it is direct evidence for why the per-change re-investigation rule earns its cost.

**(a) Quote-style blindness.** A sweep for telemetry event names using `track\('…'` (single quotes
only) returned **8** events. `RightPane.tsx` uses double quotes. Re-running with `['\"]` returned
**10** — `feedback_submitted` and `layout_saved` had been invisible. A 20 % under-report from one
character in a regex.

**(b) One-hop call analysis produced a dangerously wrong safety classification.** Classifying Tauri
commands by whether they *directly* call an agent helper put `launch`, `presets_run` and
`quickpresets_run` in the **"does not reach the agent"** column — i.e. it would have declared
*"Apply a Layout"* safe for the tour to fire. Applying a Layout launches programs and rearranges
every window on the user's desktop. They reach the agent through `run_launch` and
`apply_multiwindow`. Only the transitive closure (§4.2) is correct, and only the sum check
(9 + 23 = 32 against an independently derived total of 32) demonstrates the classification is
complete.

**This is the finding that most justifies the method.** The wrong answer was the comfortable one, it
was produced by a plausible-looking analysis, and nothing would have contradicted it until a user's
desktop was rearranged by a tutorial.

### F-6 — The Rust gate cannot speak to this feature

8 tests, all passing, all in `backend.rs` and `license.rs`, **none** touching UI behaviour (§1.2).
Recorded so that a green Rust gate is never offered as evidence that a walkthrough change is correct.

### F-7 — The manual's screenshots are still placeholders

`docs/manual/README.md` defers screenshot capture to "UI freeze (~Step 2.4)"; the HTML sources still
carry `<div class="shot-ph">` placeholders. If the walkthrough ships while the PDF still shows dashed
boxes, the walkthrough becomes the de facto manual and the PDF reads as abandoned. Not a blocker for
this programme; a decision the operator owns (§9, D-7).

### F-8 — The safety boundary proposed in v1.0 was incomplete, and the gap was found by a question about the exit button (added v1.1)

**How it surfaced.** The operator asked for an always-available exit (REQ-1). Specifying it properly
required answering *"what could a step already have done before the user exits?"* — and that question
exposed that the D-1 boundary as originally drafted only covered **one** of three ways the
walkthrough could damage the user's work.

**Evidence:** §4.4. `presets_delete` and `quickpresets_delete` call `fs::remove_file`;
`presets_save` / `quickpresets_save` call `fs::write` over an existing slot; `license_deactivate`
clears the device's licence. All five sat in the **"safe 23"** column of §4.2. Separately,
`clearAllGrids` (`AppState.tsx:637-641`) wipes every monitor's assignments, args and grid sizes and
**never crosses into Rust at all**, so it appears in neither column of the 32-command surface.

**What v1.0 would have permitted.** Under the boundary as first written — *"never fire the six
commands that mutate the desktop"* — a walkthrough step demonstrating the Layouts tab would have been
free to call `presets_delete` and permanently delete the user's saved Layout, or call `clearAllGrids`
and wipe their entire multi-monitor arrangement, while remaining fully compliant with the stated
rule and touching no window.

**Why the original framing failed.** "Reaches the WinAgent" is a *mechanism* boundary. The thing that
actually matters is a *consequence* boundary — "can the user lose work they cannot get back". The two
overlap heavily, which is what made the mechanism boundary look sufficient. It was not.

**Consequence for Phase 1:** D-1's enforcement check must cover **all three lists** of §4.4, and
cannot be implemented as a guard on the `api.ts` surface alone. This is the second time in this
investigation that a plausible one-dimensional classification produced a dangerous answer (cf.
F-5(b)); the pattern is now explicit enough to state as a rule for the work plan: **classify by
consequence, verify the categories sum, and only then trust the list.**

### F-9 — There is already a mandatory choke point that can carry the checks, and it is not husky (added v1.2)

**The problem (F-2 restated):** husky is inert, and wiring it would run an undefined `npm test` on
every commit, breaking every commit in the repo. So the obvious enforcement route is a trap.

**The finding.** `src-tauri/tauri.conf.json` declares:

```
"beforeBuildCommand": "npm --prefix ui run build && node src-tauri/scripts/build-agent.mjs"
```

and `.github/workflows/release.yml:103` runs `npx tauri build --bundles nsis`.

npm automatically runs a `pre<script>` before `<script>`. Therefore adding a **`prebuild`** script to
`ui/package.json` causes the checks to run at **three points that already exist and are already
mandatory**:

1. every local UI gate run — `npm run build` (§4a of the handbook);
2. every Sandbox build — `sandbox.mjs` drives the same tauri build;
3. **every release-robot build** — `npx tauri build` → `beforeBuildCommand` → `npm --prefix ui run build` → `prebuild`.

**Why this is the right answer to D-6.** It converts the checks from discipline into a mechanism, at
the exact gate this project already treats as unconditional, with **no risk of blocking commits**. It
also delivers part of an item the Platform plan has carried as outstanding since 2026-06-18
(Phase 1.6, *"CI-side gates — `npm run build` + `cargo test` + i18n parity run inside the robot"*).

**Stated limits, so this is not over-claimed.** `prebuild` fires on `npm run build`. It does **not**
fire on `npm run build:check` (`vite build` directly) or on a bare `vite build`, and it does **not**
gate commits — broken parity can be committed and is caught at the next build rather than at the
commit. That is a weaker guarantee than a commit hook and a far safer one. Anything stronger is a
separate decision, deliberately not taken here.

---

## §7 — Risks

| ID | Risk | Likelihood | Impact | Evidence |
|---|---|---|---|---|
| R-1 | Overlay highlights land in the wrong place under the scaled construct / inner scrolls | **High** | Visible, embarrassing, affects every step | C-2 |
| R-2 | A Spanish user silently receives English tutorial text | **High** without a mechanism | Ships broken to half the audience, invisible to every gate | C-5, F-3 |
| R-3 | A renamed anchor turns a step into a confident tooltip on empty space | Medium | Silent; no gate detects it | F-4 |
| R-4 | The tour fires an OS-mutating action and rearranges or closes the user's real work | Low **if** the reach set is enforced; **high if it is assumed** | Severe — data loss | §4, F-5(b) |
| R-5 | Same guidance drifts across manual / Help tab / tour | Medium | Maintenance cost, contradictory answers to users | §2 |
| R-6 | Bundle grows materially from step content on an already-warned 745.79 kB chunk | Medium | Slower cold start | §1.1 |
| R-7 | Plan discipline decays; the plan stops matching reality | Medium | The whole method degrades to ceremony | F-2 (no working gate exists to hold it) |
| R-8 | A user is trapped in a broken tour with no way out — the step failed, and the exit was inside the failed step's card | Medium **without** R1.3 | Severe perceived quality failure; worse than shipping no tour | REQ-1, F-4, C-2 |
| R-9 | The tour destroys saved Layouts / Quick Presets / the whole grid arrangement while obeying a desktop-only prohibition | Low **with** the three-axis check; **high** with the v1.0 boundary | Severe — permanent loss of the user's saved work | F-8, §4.4 |

---

## §8 — What the Phase 1 work plan must contain

Derived from the above; not itself a plan.

1. A **rollback point** established before the first edit (`pre-assisted-help-v1` at `303fce2`), and
   the rule for when subsequent `pre-*` tags are cut.
2. An **anchor registry** as a first-class artifact — the declared list of anchors, which UI state
   each is reachable in, and which chapter/step consumes it. This is what makes F-4 tractable.
3. A **coverage check written before the anchor sweep** and **proven to bite** by deliberately
   breaking an anchor. Must read files with `--text`/`-a` or otherwise be proven to read
   `layoutBuilder.ts` (F-1).
4. An **i18n parity check** (F-3), likewise proven to bite by deliberately removing one ES key.
5. The **enforced prohibition, across all three axes of §4.4** — the 6 OS mutators, the 5
   data-destroying commands, and the destructive `AppState` mutators, each named explicitly, with a
   mechanical check that no walkthrough module imports or calls any of them. Not a written rule, and
   **not a guard on `api.ts` alone** (F-8). Proven to bite before it is trusted.
5a. **REQ-1, the always-available exit** (§5A) — including R1.3 (exit rendered at provider level, not
   inside the step card) and the R1.7 verification obligation that exit is proven in the
   **broken-step** case, not the happy path.
6. Per-increment: its own re-investigation, `Done when`, dry-run step, real-working-verification
   step, and a status field updated in the same turn as the work.
7. The **decisions in §9**, each either resolved with a recorded rationale or explicitly parked.
8. A statement of how the plan itself is kept honest, given F-2.

---

## §9 — Open questions the work plan must resolve

**Rulings received 2026-08-23 (recorded in v1.1).** D-1 and D-2 are **RULED** and are no longer open;
they are retained here with their disposition so the record shows what was decided and when.

| ID | Question | Status |
|---|---|---|
| **D-1** | Is the mutation prohibition adopted — the 6 OS-mutating commands never fired by the tour, the 3 read-only ones permitted? | ✅ **RULED: ADOPTED** (2026-08-23). ⚠ **Amended by F-8 the same day:** the boundary must cover **all three axes** of §4.4 — the 6 OS mutators, the 5 data-destroying commands, and the destructive `AppState` mutators. Enforcement cannot live at the `api.ts` boundary alone. |
| **D-2** | Structure: a short mandatory spine plus on-demand chapters, versus one linear walkthrough? | ✅ **RULED: spine + on-demand chapters** (2026-08-23) |
| **REQ-1** | Always-available exit from a running walkthrough | ✅ **REQUIRED** (2026-08-23) — full specification in §5A |
| **D-3** | Navigation: lift `tab`/`sub` into `AppState`, or extend the `insta:*` window-event bus? Precedent (`editingLayoutId`) favours lifting; the event bus cannot report current state. | Plan decision, evidence favours lifting |
| **D-4** | Bind chapters to the 8 existing `HELP_SECTIONS` ids, giving one taxonomy across manual / Help tab / tour? | Plan decision, evidence favours yes |
| **D-5** | Overlay z-index band (must exceed modals at `z-[80]`, must stay below `ConfirmDialog` at `z-[100]`) | Plan decision |
| **D-6** | How plan discipline and the new checks are enforced given husky is inert (F-2). | ✅ **RESOLVED 2026-08-23 by F-9** — a `prebuild` script in `ui/package.json`, which npm runs before `build`, placing the checks inside the local gate, the Sandbox build **and** the release robot, without touching husky or blocking commits. Limits stated in F-9. |
| **D-11** | Presentation medium for the four walled-off actions: recorded video clips, or code-drawn schematic animation? | ✅ **RULED: schematic animation, no video in the installer** (2026-08-23). Full rationale in §5A / REQ-2. Video reserved for website + commercial handout. |
| **D-12** | Snapshot/restore of the working state on teardown — does the walkthrough put everything back exactly as it found it? | ✅ **RULED: ADOPTED** (2026-08-23). The walkthrough restores the working state on every teardown route, and *"the help changes nothing"* becomes an automated before/after assertion. **This supersedes R1.5's original "nothing is reverted" wording** — see the amendment note in §5A. |
| **D-7** | Does the walkthrough retire the manual's screenshot backlog, or add to it? (F-7) | **Operator ruling needed** |
| **D-8** | Is a first-run auto-offer shown at all, or is the walkthrough purely on-demand from Help? | **Operator ruling needed** |
| **D-9** | New localStorage key separator — `instadesk:` (8 keys) or `instadesk.` (2 keys)? (C-6) | Plan decision, evidence favours `instadesk:` |
| **D-10** | Should F-1 (the NUL byte) be scheduled as its own separate increment, or left parked indefinitely? | **Operator ruling needed** |

---

## §10 — Verification record for this document

Every claim above is re-derivable. Commands were run against commit `303fce2`, on 2026-08-23, from
`C:\FcXe Studios\Instadesk\instadesk-tauri`.

| Claim | How it was established |
|---|---|
| Live version v0.3.0, 3 assets, not prerelease | `gh release list`, `gh release view v0.3.0 --json`, `curl` of the live `latest.json` |
| Baseline gates green | `npm run build` (exit 0); `cargo test --lib` + `cargo build --lib` (exit 0, 8/8 tests) |
| 159 `pre-*` tags | `git tag -l 'pre-*' \| wc -l` |
| 471 = 471 i18n leaf keys | Python recursive leaf count over both locale JSON files |
| 2 anchor-like attributes in the UI | grep for `data-[a-z-]+=` and `id="…"` across `ui/src/**/*.tsx` |
| 32 Tauri commands; 28 + 3 + 1 by file | grep `#[tauri::command]` across `src-tauri/src/*.rs` |
| 9 reach the agent / 23 do not; 9 + 23 = 32 | Python transitive closure over the `backend.rs` call graph from 5 agent helpers, with an independent sum check |
| NUL byte at offset 6123, line 146 | Python byte scan of `layoutBuilder.ts`; `file` reports `data` |
| Husky inert | `cat -A ui/.husky/pre-commit` (10 bytes, `npm test^M$`); `git config --get core.hooksPath` (unset); `ls .git/hooks` (samples only) |
| No i18n parity mechanism | repo-wide grep for parity/locale checks — one hit, a markdown checkbox |

**Known limits of this investigation.** It did not run the Sandbox (`sandbox.mjs --dev`), so no claim
is made about runtime behaviour. It did not measure the actual bundle delta of a walkthrough, only
the baseline. The anchor distribution in C-1 is an enumeration estimate, explicitly flagged as a
Phase 1 deliverable rather than a measurement. No claim is made about how long anything takes.

---

*Phase 0 output. Nothing in the application was modified in producing this document.*

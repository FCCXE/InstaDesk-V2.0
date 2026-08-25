# Quick Preset Toggle — Phase 0 Deep Investigation

> **Status: reading SETTLED by the operator, 2026-08-24 — see §9. Evidence complete.**
> Document of record for the Phase 0 stage of the next InstaDesk upgrade, the operator's
> stated next front: *"a toggle between Quick Presets."*
>
> Governed by `docs/SESSION_RESUMPTION.md` §0 (the ratified three-phase method).
> Phase 0 is **evidence only**. Nothing in this document is a design commitment, and no
> Phase 1 work plan may be written until §7 is answered by the operator.
>
> Opened: **2026-08-24**, on top of the closed v0.4.0 programme.

---

## §0 — What this document is, and is not

**It is:** the measured baseline, the complete Quick Preset surface enumerated from the code,
the constraints that surface imposes, the findings that fell out of reading it, and the one
question that must be settled before anything is planned.

**It is not:** a design, a proposal, a recommendation of *what to build*. §6 enumerates the
readings the operator's phrase admits and records what the evidence says about each — that is
evidence about feasibility and cost, not a choice. The choice is the operator's (§7).

Every claim below was re-derived from the source in this session. Nothing is quoted from memory
or from the previous programme's notes.

---

## §1 — Baseline, measured before anything was touched

### 1.1 Live version — four sources agree

| Source | Value |
|---|---|
| `gh release list --repo FCCXE/InstaDesk-V2.0` | `InstaDesk v0.4.0` — **Latest** — tag `v0.4.0` — 2026-08-24T22:41:37Z |
| `src-tauri/tauri.conf.json:5` | `"version": "0.4.0"` |
| `src-tauri/Cargo.toml:3` | `version = "0.4.0"` |
| `CHANGELOG.md` | `## [0.4.0] - 2026-08-24`; `## [Unreleased]` is empty |

### 1.2 UI gate — PASS (exit 0)

`cd ui && npm run build`. All four `prebuild` gates fired and passed:

```
i18n parity: OK — en=595 es=595 leaf keys, sets identical, no duplicates, no shape mismatches
tour safety: OK — 8 walkthrough file(s) scanned, 18 forbidden identifiers + direct invoke()
tour anchors: OK — 47 registered, 47 in source, 45 step reference(s), all agree
tour content: OK — 9 chapters have text in en.json; grid-size claims check out against 4 offered sizes
tsc -b && vite build → 451 modules transformed, built in 5.00s
```

Run without truncation (handbook §10: `head` on a build pipe kills npm with EPIPE and reads as
a failure that never happened).

### 1.3 Rust gate — PASS (exit 0)

`cd src-tauri && cargo test --lib && cargo build --lib` — **8 passed, 0 failed**; `cargo build
--lib` finished in 21.04s.

### 1.4 Working tree — clean in both repos

| Repo | HEAD | vs `origin/main` | Untracked |
|---|---|---|---|
| App (`instadesk-tauri`) | `b6f1286` *docs(handbook): bring the on-ramp current for v0.4.0* | identical | `docs/marketing/`, `ui/public/brand/FLCX Studios.png` |
| WinAgent (`Instadesk`) | `dd80f84` *feat(agent): add --close-all verb* | identical | 2 SVGs, `instadesk-tauri/` (expected — never `git add` it here) |

### 1.5 Rollback point — confirmed to exist

`git tag -l "v0.4.0"` returns `v0.4.0` → `b5120e14160bcc1534e9a38caea95938cc398359`.
Verified with `git tag -l`, **not** `git rev-parse`, which echoes a missing tag's name back and
reads as a false positive (handbook §10). HEAD is two docs-only commits ahead of that tag.

**The rollback point for this programme is `v0.4.0`.**

---

## §2 — The Quick Preset estate, enumerated

### 2.1 Files that carry Quick Preset logic (binary-safe sweep)

The plain sweep was re-run with `grep -a`, because `ui/src/services/layoutBuilder.ts` still
contains **1 literal NUL byte** (size 20 983) and grep silently skips it as binary — finding F-1
of the previous programme, still live. The `-a` sweep agrees with the plain one on QP files, and
additionally showed `layoutBuilder.ts` is where `singleInstance` is *decided* (§3, C-2).

| Layer | File | What it holds |
|---|---|---|
| Rust | `src-tauri/src/backend.rs` | `quickpresets_dir` (284), `_list` (640), `_get` (687), `_save` (707), `_delete` (752), `_run` (1288) |
| Rust | `src-tauri/src/lib.rs` | `quickpreset_slot_for` (30), `QUICKPRESET_DIGITS` (57), command registration (203-211), hotkey emit (255) |
| API | `ui/src/services/api.ts` | 4 types (157-189) + 5 client methods (260-281) |
| UI | `ui/src/components/MonitorSelector.tsx` | left-pane chooser, Apply, hotkey listener, manager launch |
| UI | `ui/src/components/quickpresets/QuickPresetsManager.tsx` | modal CRUD over the 26 slots |
| UI | `ui/src/components/settings/SettingsPane.tsx` | Shortcuts row (363, 373) |
| UI | `ui/src/components/RightPane.tsx` | `"quickPresets"` as a Help section id (1038) |
| UI | `ui/src/components/layouts/LayoutPreviewOverlay.tsx` | borrows `quickPresets.closeEsc` only |
| Tour | `ui/src/tour/anchors.json`, `ui/src/tour/chapters.ts` | 5 anchors, 1 chapter of 4 steps |
| Gate | `ui/scripts/check-tour-safety.mjs` | QP run verbs in the forbidden-identifier list |
| i18n | `ui/src/i18n/locales/{en,es}.json` | `monitor.*` (39 keys) + `quickPresets.*` (36 keys) |

### 2.2 The data model

```
DATA_DIR/quickpresets/QP_{SLOT}.json
{ "kind": "quickpreset", "slot": "A", "name": "…", "layouts": [ {"kind":"general","slot":"A"}, … ] }
```

- **26 slots, A–Z** (`QuickPresetsManager.tsx:18`). The manager offers only free slots.
- A Quick Preset **references** Layouts by `(kind, slot)`; it does not copy them. A dangling
  reference is tolerated at save time and reported (`missingLayouts`), and fails per-Layout at
  run time with *"Layout general/X no longer exists."*
- `layouts` is an **ordered** list — `quickpresets_run` applies them sequentially, top to bottom.

### 2.3 What actually exists on this machine

`find` over both repos and `AppData\Roaming` returns exactly three QP files — one per data dir,
all in slot **A**, no other slot used anywhere:

| Data dir | Slot | Name | Layouts |
|---|---|---|---|
| `…\Roaming\com.fcxestudios.instadesk\` (installed) | A | *Jubille - CSP - FLCX* | general A, B, C |
| `C:\FcXe Studios\Instadesk\data\` (dev fallback) | A | *General Framework + Obsidian* | general A, B, C |
| `…\Roaming\com.fcxestudios.instadesk.sandbox\` | A | (sandbox copy) | — |

Six Layouts exist (`general_A.json` … `general_F.json`) in both real data dirs.

> **Today, "between Quick Presets" is a toggle between one Quick Preset and nothing.**
> Whatever is built must define its behaviour at n=0 and n=1, not only at n≥2.

---

## §3 — Constraints established from the code

### C-1 — Applying is purely **additive**. Nothing is ever taken down.

`quickpresets_run` (backend.rs:1288) → per Layout ref → `apply_preset` (1058) → per assignment
→ `run_launch` (995) → the WinAgent. Read end to end, **no step in that chain closes, hides,
minimises or reclaims any window.** `apply_preset` launches and places; that is all it does.

Applying QP B while QP A is on screen therefore leaves QP A's windows exactly where they are,
with QP B's windows placed on top of them.

### C-2 — For multi-instance apps, every Apply **spawns a new window**.

`Program.cs:655-683` — the "tile the existing window without relaunching" fast path runs **only**
when `--single-instance` is set:

> *"For multi-instance apps (Notepad, browsers via `--new-window`, File Explorer, Office
> editors), `--single-instance` is NOT set, so we always launch and find the new window via
> snapshot-diff. That way each Apply produces a brand-new window even when other windows of the
> same app already exist."*

In the whole catalog only **Outlook** and **Teams** set `singleInstance: true`
(`appsCatalog.ts:38,50`). `layoutBuilder.ts:57,67,91` sets `singleInstance: false` for every
browser entry, and the operator's own `general_A.json` carries `"singleInstance": false` with
`"args": "--new-window"` on each Chrome assignment.

**Consequence, measured not assumed:** a control that re-applies Quick Presets in sequence
produces a *fresh* set of Chrome / VS Code windows on every press. Toggle A → B → A and the
desktop holds three sets, not one. This is the load-bearing constraint for any reading of
"toggle" that means *switch the desk*.

### C-3 — Nothing records which windows belong to which Quick Preset.

The agent's launch-success JSON (`Program.cs:983-1006`) carries `processId` but **no HWND**. The
Rust layer never parses it: `run_launch` returns `{ exitCode, stdout, stderr, cmd }` with that
JSON left inside `stdout` as raw text, and `apply_preset` passes those objects through verbatim.
The UI only counts them (`r.results.length` → "N windows").

There is no ownership record anywhere — not in memory, not on disk. **Any behaviour that must
undo, close, hide or replace "the previous Quick Preset's windows" requires this record to be
built first**, which is a WinAgent + Rust change, not a UI change.

### C-4 — The only desk-clearing verbs are global and unscoped.

- `arrange_all_windows(action)` (backend.rs:206) — `"minimize"` / `"restore"` over **every**
  normal top-level window.
- `close_all_windows()` (backend.rs:241) — graceful `WM_CLOSE` to **every** normal top-level
  window; UI gates it behind a destructive confirm.

Both exclude InstaDesk's own windows and skip elevated apps (Windows UIPI), reporting
`skippedElevated`. Neither can be scoped to a Layout or a Quick Preset, and scoping them depends
on C-3.

### C-5 — A per-Quick-Preset global hotkey already exists — and it is not a toggle.

`lib.rs:30-57` maps **Ctrl+Alt+1..9 → slot A..I**, emitted as `insta://hotkey/quickpreset`;
`MonitorSelector.tsx:153-162` listens and calls `runQuickPreset(slot, 'hotkey')`. Documented in
Settings → Shortcuts as *"Apply Quick Preset 1–9"*.

These digits are **fixed and not rebindable** — `hotkeys.ts` handles only `show` and `snap`, and
its own header says so. They cover **9 of the 26 slots**.

**So "apply a named Quick Preset from anywhere, without opening InstaDesk" is already shipped.**
Whatever the operator means by *toggle*, it has to be something this does not already do.

### C-6 — There is no persisted notion of "the current Quick Preset".

Full `localStorage` inventory found in `ui/src`: `gridSizeByMonitor`, `defaultGridSize`,
`windowMargin`, `browsers`, `theme`, `lang`, `telemetryOptOut`, `installId`, `hotkey:show`,
`hotkey:snap`, `guidedTourHideOffer`, plus the tour's own namespace. **No key records an active,
current or last-applied Quick Preset.**

In the UI, `selected` is component-local `useState` in `MonitorSelector` and is *cleared* when
its underlying entry disappears (lines 68-80). Per the standing memory rule, state that must
survive a tab toggle has to live in `AppState`, not in a pane.

### C-7 — Every run path is licence-gated.

`quickpresets_run`, `presets_run`, `arrange_all_windows` and `close_all_windows` all call
`locked_guard()?` as their first statement. A toggle inherits that gate for free — but it also
means the toggle must behave sanely when the app is locked.

### C-8 — Any new control carries four gate obligations, in the same commit.

1. **`check-tour-anchors`** — a `data-tour` attribute *and* an `anchors.json` entry with
   `reachableWhen`. The gate bites in **both** directions; either one alone fails the build.
2. **`check-i18n-parity`** — EN and ES are at exactly **595 = 595** leaf keys today. Every new
   string lands in both.
3. **`check-tour-safety`** — if the control is referenced from `src/tour/**`, its verb must not
   be a desktop mutator. `quickpresets_run` is already on the forbidden list.
4. **`check-tour-content`** — walkthrough prose must remain true.

Registered QP anchors today — **five**, not the four listed in handbook §8; the on-ramp's
starting-evidence list omits `qp-layouts-link`:

`quick-presets-section`, `qp-manage-button`, `qp-layouts-link`, `qp-dropdown`, `qp-apply-button`.

The `quickPresets` tour chapter (`chapters.ts:66-74`) walks four of them.

### C-9 — The left pane is a finite column.

`MonitorSelector.tsx` stacks, inside the fixed 1280×820 construct: Quick Presets title → two
action buttons (`Manage QPs`, `Layouts ↗`) → chooser + Apply → status line → Monitor Selection →
`DisplayArray` → Identify monitors. The `aside` is `overflow-y-auto`. A new *persistent* control
competes for that column; a new *modal* control must portal to `document.body` or the scaled
transform traps it.

---

## §4 — Findings

### F-1 — The most literal reading of the request is already shipped.
Ctrl+Alt+1..9 applies Quick Presets A..I from anywhere (C-5). Any plan that lands on "a hotkey
to apply a Quick Preset" would be re-shipping v0.2-era behaviour. This must be settled before a
plan, not discovered during one.

### F-2 — A naive toggle multiplies windows instead of switching them.
C-1 + C-2 together: repeated application is additive *and* spawns duplicates. A "toggle" is by
definition a control pressed repeatedly. The naive implementation — call `quickpresets_run` on
the other slot — is the one implementation that is guaranteed to degrade the desktop with use.

### F-3 — "Switch back" has nothing to switch back to.
C-3 + C-6: no window ownership, no active-preset state. A toggle that promises to *return* the
desk to a previous arrangement is not a UI feature; it requires new state in the WinAgent and
the Rust tier first.

### F-4 — The blast radius is the entire desktop, and it is irreversible.
`quickpresets_run` reaches the agent, launches programs and moves every window it places. The
previous programme's recorded trap applies verbatim: *classify by consequence, not by mechanism*.
A fast-repeating control on an irreversible whole-desktop action needs its safety answer decided
in Phase 1, not bolted on in Phase 2.

### F-5 — At today's data, the feature has no second state.
One Quick Preset exists (§2.3). Behaviour at n=0 and n=1 is not an edge case here; it is the
operator's current everyday state.

### F-6 — A WinAgent change re-arms the two-repo sequencing trap.
`Program.cs` was untouched for the whole v0.4.0 programme. Any reading that needs C-3 (window
ownership) changes it — and the release robot builds the agent from the **WinAgent repo's** HEAD,
so that push must precede the app-repo tag (handbook §2). Dormant for one programme; live again
the moment this direction is chosen.

### F-7 — The tour's own prose becomes a maintenance obligation.
`tour.chapters.quickPresets.steps.qp-dropdown.body` currently reads *"This lists your Quick
Presets and your individual Layouts together — pick either."* If the chooser gains a toggle, that
sentence is incomplete. `check-tour-content` verifies grid-size claims, **not** this — the gate
would stay green while the walkthrough went stale (the recorded "gates verify structure, nothing
verifies prose is TRUE" trap).

---

## §5 — Layers each candidate reading would touch

| | UI | i18n EN+ES | anchors + tour | api.ts | Rust | **WinAgent** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Cycle to the next QP | ● | ● | ● | ○ | ○ | ○ |
| A/B switch between two nominated QPs | ● | ● | ● | ○ | ○ | ○ |
| Enable/disable Layouts inside a QP | ● | ● | ● | ● | ● | ○ |
| Switch the desk (take the old one down) | ● | ● | ● | ● | ● | **●** |
| Apply / revert-to-before | ● | ● | ● | ● | ● | **●** |

● = must change ○ = unchanged. The bottom two rows are the ones that need C-3 built.

---

## §6 — The readings the phrase admits, and what the evidence says

Recorded as **unknowns**, not options to be picked by me.

- **R-1 — Cycle.** One control (button and/or hotkey) applies the *next* Quick Preset in order,
  A → B → C → A. Cheapest; entirely additive; needs a persisted cursor (C-6). Collides head-on
  with F-2: cycling is the fastest way to duplicate windows.
- **R-2 — A/B switch.** A two-position switch between two *nominated* Quick Presets (e.g.
  "Work" ⇄ "Trading"). Same cost as R-1, but bounded to two — the duplication of F-2 is smaller
  and more predictable, and it reads most naturally as the English word *toggle*.
- **R-3 — Toggle within a Quick Preset.** Checkboxes to include/exclude individual Layouts
  before applying the bundle. Touches the manager and the QP file format, not the desktop
  semantics; no C-3 dependency; does not answer "between Quick Presets" literally.
- **R-4 — Switch the desk.** Apply QP B *and take QP A's windows down*. The only reading that
  makes "toggle **between**" literally true on screen. Requires C-3 (window ownership) → WinAgent
  change → F-6 sequencing trap. The largest of the five by a wide margin.
- **R-5 — Apply / revert.** Press once to apply, press again to put the desk back as it was.
  Requires C-3 *and* a capture of the pre-apply state (`capture_layout` exists as a primitive at
  backend.rs:1398 but is not wired to this). Largest blast radius; hardest to make safe.

**What the evidence favours, stated as evidence:** R-2 is the only reading that is both literally
a *toggle* and buildable without touching the WinAgent. R-4 is what the phrase most likely means
in everyday English and is roughly a v0.4.0-sized programme. R-1 and R-2 are cheap but inherit
F-2 unless the plan answers what happens to the windows already on screen.

---

## §7 — The question that must be settled before Phase 1

> **Which of R-1 … R-5 is "a toggle between Quick Presets"?**
> And, for whichever it is: **when you press it, what should happen to the windows that are
> already on the screen?**

That second half is not a detail. C-1, C-2 and C-3 mean the app currently has no answer to it,
and the answer determines whether this is a UI increment or a three-tier programme with a
WinAgent change.

**No Phase 1 work plan may be written until this is answered.**

---

## §8 — Risks carried into Phase 1, whichever reading wins

| # | Risk | Evidence |
|---|---|---|
| R-a | Window duplication on repeat presses | C-1, C-2, F-2 |
| R-b | Irreversible whole-desktop action behind a fast control | C-4, F-4 |
| R-c | Feature has no second state on the operator's own machine | §2.3, F-5 |
| R-d | Two-repo release sequencing re-armed | F-6 |
| R-e | Walkthrough prose silently goes stale | F-7 |
| R-f | Left-pane column has little room left | C-9 |
| R-g | `layoutBuilder.ts` NUL byte still hides itself from plain grep | §2.1 |

---

## §9 — Operator ruling on §7 (2026-08-24)

> *"I click on apply preset, and the app implements the selected preset, but if I click on a
> second preset, the mechanism closes the existing implemented preset and open the new preset,
> and so forth and so on."*

**Reading settled: R-4 — switch the desk.** InstaDesk holds a notion of *the preset currently on
screen*; applying a different one takes the current one down first, then puts the new one up.
One preset live at a time. The desk **swaps**, it does not accumulate.

This is the reading that requires C-3 (window ownership) to be built, and therefore a
**WinAgent change** — F-6's two-repo sequencing trap is live again for this programme.

The two findings below were derived *after* the ruling, because the ruling made them decisive.

### F-8 — The reliable ownership handle is the **HWND**, the agent already computes it, and it does not emit it.

For every window it places, the agent resolves an exact `hwnd` by snapshot-diff, explicitly
excluding `preLaunchWindows` (`Program.cs:722-767`) — that is precisely "the windows this apply
created". But the success JSON (`Program.cs:983-1006`) emits `processId` and **no `hwnd`**.

Worse, that `processId` is not usable as the handle:

- On the fresh-launch path it is set once, at `reportedPid = proc.Id` (`Program.cs:691`), and is
  **never corrected** from the window that is finally resolved. `GetWindowThreadProcessId` is
  called only on the single-instance fast path (line 680).
- For browsers and Electron apps the launcher process routinely exits and hands off to an
  already-running instance — the agent logs `procExited={proc.HasExited}` and treats it as
  normal (line 766). So the emitted PID is frequently a **dead launcher PID**, while the real
  window belongs to a pre-existing `chrome.exe` that also owns **the user's own tabs**.

**Consequence:** closing "the previous preset" by PID would either miss the windows entirely, or
close windows the user opened themselves. The feature must thread the **HWND** back from the
agent, through Rust, into a per-preset ownership record. That is the spine of this programme.

**And the corollary hazard:** Windows recycles HWND values. A stored handle must be revalidated
(still a window, still the same executable, still the same title shape) before anything is closed
through it, or a stale record closes a stranger's window. Same class as the recorded "an empty
value asks HOW it became empty" trap.

### F-9 — Part of the operator's own Quick Preset **cannot be closed**, by design.

`backend.rs:202-204` records it in the codebase's own words: *"Elevated apps (e.g. iVMS-4200)
can't be controlled by this non-elevated helper — Windows UIPI blocks it — so they're skipped and
reported."* Both `arrange_all_windows` and `close_all_windows` return `skippedElevated` for
exactly this reason.

The operator's live `general_A.json` — reached by `QP_A` ("Jubille - CSP - FLCX") — contains
**iVMS-4200** on monitor 2. So on this machine, the very first real use of the toggle will hit a
window the mechanism is not permitted to close.

This is a **hard platform limit, not a design choice**. The plan must decide what the toggle
*says* when it cannot fully take the old preset down — silently leaving the window behind is the
reassuring reading, and the reassuring reading is the one this project has been bitten by.

### §9.1 — Further operator rulings (2026-08-24)

**D-1 — The elevated window is not a limitation; it is a report.** The toggle takes down what it
can and *tells the user which window it could not close and why*. F-9 stands as recorded, but it
is a reporting requirement, not a blocker.

**D-2 — Windows with unsaved work must not be destroyed.** Operator's words: *"It will also avoid
closing windows with unsaved work (like it currently does)."* The intent is settled. The
parenthesis is not accurate about today's mechanism — see F-10 — and the plan must implement the
intent, not the parenthesis.

### F-10 — Today's close is fire-and-forget, and `affected` counts requests, not closures.

`RunCloseAllWindows` (`Program.cs:2197-2212`) iterates the windows and calls
**`PostMessage(hwnd, WM_CLOSE, …)`** — deliberately `PostMessage` and not `SendMessage`, *"so a
modal save dialog on one window can't block the sweep across the rest."* It then returns
`affected` = the number of messages **posted**.

So today the app does **not** avoid closing windows with unsaved work, and it does not verify any
closure:

- It asks each window to close; the *application* decides what to do, and an app with unsaved
  work shows its own save prompt. Nothing is force-killed — that part of the operator's
  recollection is exactly right.
- But if the user presses **Cancel** on that save prompt, the window stays open **and InstaDesk
  never learns**. `affected` already counted it.

For "Close all windows" that is acceptable: the user is watching, and the action has no second
half. **For a preset swap it is not**, for three reasons:

1. The swap does not wait. The new preset would start opening while save dialogs from the old one
   are still on screen.
2. A cancelled save prompt leaves the old preset **partly** on screen while the new one is placed
   on top — the exact accumulation the whole feature exists to prevent (F-2).
3. The app cannot honestly report "the previous preset came down", because it never measured
   whether it did. A count of requests sent, reported as an outcome achieved, is the recorded
   *"a measurement that is not reproducible is not a measurement"* failure mode.

**Requirement this creates:** the teardown must be **verify-then-report** — post `WM_CLOSE` to the
tracked handles, then poll those handles for a bounded interval and classify each one as *closed*,
*still open* (save prompt pending, or the user declined), or *skipped — elevated*. The swap
proceeds on the measured result, and the user is told the truth about anything left behind.

---

*Phase 0 evidence complete and the reading is settled. Baseline green in both gates, rollback
point `v0.4.0` confirmed, surface enumerated, constraints computed, ownership handle identified.
Phase 1 work plan may now be written.*

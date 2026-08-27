# InstaDesk — wiring audit: features that exist but are not reachable

> Operator-requested 2026-08-27: *"a full deep audit of our app in search of non wired features, like
> the one we just spotted and fixed inside our URL Builder."*
>
> Measured with `ui/scripts/audit-wiring.mjs` at commit `8cdfa72`, then **every candidate opened and
> read**. No code changed.

---

## §1 — The instrument failed twice before it was trusted, and that is the main lesson

The audit's whole value depends on the detector actually finding this class. So before running it on
anything, it was pointed at the commit **where the known defect was still live**
(`pre-remove-openmode`) and required to find `openMode`.

**Version 1 asked "does any component reference this member?"** — and reported a clean bill of health.
The answer for `openMode` was *yes*: `setOpenMode` really was called by the radio's `onChange`, and
`openMode` really was read by `checked={urlBuilder.openMode === "single"}`. **Reachability is not
consumption.**

**Version 2 asked "is it read by anything that acts?"** — and *still* reported nothing, for a
completely different reason: `openMode` was never a member of the context at all. It lived **nested**
inside `urlBuilder`, so no scan of context members could see it however cleverly it classified reads.

**Version 3 starts from the WRITE PATH.** Every `setX` on the context is a promise that some `x` is
worth remembering; derive the field from the setter and ask what ever reads it. That reaches nested
fields, because it never needed the field to be top-level.

> Two detectors in a row certified a codebase with a known dead control in it. **Had this audit been
> run without that control, its headline would have been "no unwired features found".**

A fourth correction followed: the setter→field derivation misfires (`setUrlBrowser` writes `browser`,
not `urlBrowser`), which produced six false positives. Those are now reported separately as **blind
spots** — *"I could not analyse this"* must never be printed as *"this is dead"*.

**Controls, both directions:** at `pre-remove-openmode` probe B flags exactly **1** item, `openMode`.
At HEAD it flags **0**. Positive and negative both pass.

---

## §2 — Results

| Probe | Result |
|---|---|
| **A** — exported, never used elsewhere | **17 candidates** → triaged below |
| **B** — state nothing acts on | **0** |
| **C** — i18n keys no `t()` references | **0** |
| **D** — Rust commands the UI never invokes | **0** |
| *blind spots* | 7 setters whose field name could not be derived |

B, C and D being zero is meaningful rather than empty: B is the probe that catches the `openMode`
class, and it is proven to catch it.

---

## §3 — Findings that matter: capability that exists and cannot be reached

### W-1 — ✅ **FIXED 2026-08-27** — a Favorite can now be edited

Tag `pre-favorite-edit` pushed first. `AddFavoriteModal` gained an `editing` prop: it prefills the
record, **locks the title** (the title is what `findFavoriteByName` resolves against, so renaming is
F-2's cascade again) and **fixes the kind** (swapping app↔url changes *which* field a Layout
snapshots — a different job). The save updates **by id, never by title**.

The edit **propagates to saved Layouts**, field-scoped by kind: `kind:"app"` writes `program`,
`kind:"url"` writes `urls`. That required generalising `DefinitionChange` so **both** value fields are
optional — writing `urls: []` into an app assignment because the caller had none would corrupt it.
Four tests were witnessed red (`TypeError: change.urls is not iterable`) before the change, and one of
them re-asserts that a per-cell `args` override survives whichever field moved. **38 tests green.**

**Confirmed by the instrument that found it:** probe A drops from 17 candidates to 16, with
`updateFavorite` no longer among them.

*(original finding, for the record)*
### W-1 — **A Favorite cannot be edited** *(the same defect you just had fixed for URL groups)*

`FavoritesService.updateFavorite(id, patch)` is written, correct, and **called from nowhere**.
Favorites can be added and deleted; a wrong path or a renamed entry can only be deleted and rebuilt —
**exactly the complaint that opened the URL group front.**

> Note against my own earlier advice: during the URL group work I recommended fixing "the same
> snapshot defect" for Favorites and then **withdrew it**, because a Favorite cannot drift if it
> cannot be edited. That reasoning stands, and this is its other half: the gap is not propagation,
> it is that **editing does not exist at all**.

### W-2 — ✅ **FIXED 2026-08-27** — Favorites can be cleared

`clearFavorites` is wired behind the edit toggle, mirroring the App History pattern exactly — same
confirm shape, same `danger` flag — so two adjacent lists behave the same way instead of each
inventing its own. The confirm says what the user cannot see: **saved Layouts that use a favorite will
no longer find it.** Probe A drops to **15**.

*(original finding, for the record)*
### W-2 — **Favorites have no "clear all"**

`clearFavorites()` exists and is unreachable. App History has its clear-all wired (`clearHistory` is
called); Favorites does not. An asymmetry between two adjacent lists, not a missing capability in the
engine.

### W-3 — ✅ **FIXED 2026-08-27, operator ruled Option B**

**Copy diagnostics** sits beside the version line in Help. It gathers only what is already visible
somewhere in the app — version, mode, whether the helper program is present, the data directory, and
each monitor with its bounds AND work area — then puts it on the clipboard as plain text. Nothing is
collected the user could not read off their own screen; this saves them transcribing it, which is the
point now that a collaborator will be reporting from another PC.

Two deliberate details. A failed section **says so** (`health: unavailable — …`) rather than being
omitted: a diagnostics block that silently drops a section reads as *"everything fine here"*. And
`tsc` caught my guess at the monitor shape — `ApiMonitor` is `{index, primary, device, bounds,
workArea}`, not `{id, w, h}` — which is how the **work area** ended up in the report. It governs
placement, so a block without it would have hidden the more useful half.

### W-4 — ✅ **FIXED 2026-08-27, operator placed it**

**Copy / Paste** now sit in the Grid pane opposite the *"No selection / Selected:"* line, exactly where
the operator asked. Paste is disabled until something has been copied, and **confirms before
overwriting — but only when the target grid actually holds something**. A confirm on an empty grid is
noise that teaches people to click through the ones that matter.

The row is `flex-wrap`: the status string is translated and Spanish runs longer. The bottom bar taught
that lesson the hard way, and `check-layout-yield.mjs` now enforces it.

*(original brief, for the record)*
### W-3 — the information needed to rule

**It was never wired, not un-wired.** `git log --diff-filter=A` puts `clipboard.ts` in the very first
UI commit (`077a5b5`, *"wire React UI to FastAPI server end-to-end"*), and `git log -S "copyText("`
returns **that same commit and nothing else** — the only occurrence of the string is the definition
itself. **`copyText` has never had a caller in the history of the repo.** Speculative code, added and
forgotten.

**What it does:** writes text to the clipboard via `navigator.clipboard.writeText`, with an
`execCommand` fallback. ~20 lines, no dependencies, works.

**Where it would earn its place, in descending value:**

1. **Copy diagnostics** — version, monitor layout, agent stamp. The Help tab already prints the
   version (`RightPane.tsx:1453`) and there is nowhere to copy it from. This is worth most *right
   now*, because a collaborator is about to start reporting bugs from another PC.
2. **Copy an error message.** Backend errors only became readable today; being able to copy the exact
   sentence turns a screenshot into a searchable report.
3. **Copy a path** from App History or Favorites — useful when the path is wrong and needs pasting
   elsewhere.

| | |
|---|---|
| **A — Delete the module** | Honest and free. Loses a capability nothing uses. |
| **B — Wire "Copy diagnostics" into Help** | Small, self-contained, and immediately useful for external testing. Uses the existing function. |
| **C — Wire copy on error messages too** | More surface, more strings, more places to keep consistent. |

**Recommendation: B.** It is the one use with a concrete reason today, and it costs a button.
**A is the right answer if you would rather not carry it** — what I would not recommend is leaving an
unreachable module in place indefinitely, which is how it survived unnoticed since the first commit.

### W-4 — ⛔ **NEW: copy/paste a monitor's grid is fully built and unreachable**

Found by restoring a probe path my own instrument had lost (see below). `copyGrid` and `pasteGrid` are
declared on the context, implemented, exposed in the provider value — and **referenced by no component
and bound to no keyboard shortcut**. `copyGrid` captures a monitor's assignments *and* its per-cell
args overrides; `pasteGrid` applies both to the current monitor.

That is a genuinely useful capability — *arrange one monitor, then duplicate it onto another* — and
there is no way to reach it. Same class as `updateFavorite` (W-1), and larger. **Operator to rule on
where the affordance belongs** (bottom bar beside *Clear Present Grid*, or the monitor pane).

**Also dead, with no user-facing gap:** `replaceGrid` — superseded by `replaceGridMulti`, which the
Layout edit path uses; and the **entire pending-preset feature** (`pendingPresetByMonitor`,
`setPendingPreset`, `getPendingPreset`) which **no component touches at all**.

### ⚠ The instrument failed a FOURTH time, in the way the handbook names

Probe B version 3 pivoted to the write path, fixed nested fields — and **silently stopped examining
every context member that is not a setter**. Version 1 had flagged `copyGrid`/`pasteGrid`; version 3
never looked at them. **A fix that narrows what a check SEES is a regression even when nothing fails.**

Restoring that path then produced **59** false positives, because the regex I wrote landed in the file
as `` `${name}` `` — and in a JS template literal `` is a **BACKSPACE character**, not a word
boundary. It matched nothing, so every member looked unreferenced. That is the exact trap recorded in
the handbook, hit again, and caught only by the result being obviously absurd. Repaired by building
the backslash from `chr(92)` and reading the file back **as bytes**.

One further false positive — `sizeByMonitorId` — was a *parameter name* inside a multi-line signature,
not a member. Member extraction now requires the two-space indent of a real member.

*(original finding, for the record)*
### W-3 — **A clipboard capability with no caller**

`src/services/clipboard.ts` contains exactly one function, `copyText`, and **the entire module is
unreachable**. Whether a copy affordance was removed or never built cannot be told from the code;
what is certain is that nothing can copy anything today.

---

## §4 — Dead code, no user-facing gap

Read and confirmed harmless — worth deleting for clarity, but nothing is missing from the product:

| Symbol | Why it is not a gap |
|---|---|
| `parsePresetIntoCells` | **Superseded** by `parsePresetIntoCellsMulti`, which the Layout edit path actually uses. Legacy single-monitor version. |
| `isHidden` | A convenience wrapper over `listHiddenIds`, which is used directly. |
| `telemetryActive` | Near-duplicate of `telemetryConfigured`, which *is* used. |
| `defaultBinding` | An accessor over `DEFAULTS`, which the module already uses directly at two sites — hotkey defaults do work. |

**Over-exported (8):** `CUSTOM_APP_STYLE`, `lookupAppStyle`, `buildSaveAssignments`,
`EXPORT_FORMAT_VERSION`, `buildExportPayload`, `GRID_ROWS`, `GRID_COLS`, `TOUR_ANCHORS` — each used
only inside its own file. `export` is unnecessary; nothing is missing.

**Test-only (1):** `clearUrlGroups` — legitimate test infrastructure.

---

## §4A — The agent sweep ✅ **DONE 2026-08-27** — the blind spot §5 named

§5 flagged the most likely place for another `openMode`: values written into every saved Layout that
the agent might quietly ignore. Swept end to end — UI → preset file → Rust → agent CLI → **actual
use** — because the whole lesson of this audit is that presence is not consumption.

**Result: 21 of the agent's 22 arguments are genuinely honoured.**

| Field | Verdict |
|---|---|
| `activate` | **honoured** — drives `SetForegroundWindow` and `SWP_NOACTIVATE` |
| `topmost` | **honoured** — drives `HWND_TOPMOST` at three sites |
| `waitReadyMs` | **honoured** — a real `Thread.Sleep(args.WaitReadyMs)` |
| `singleInstance` | **honoured** — gates window reuse at two sites |
| `cellMarginPx` | **honoured** — real geometry math at three sites. **The Settings "Window margin" control works.** |
| `targetHwnd`, `gridSize`, `gridSizes` | **honoured** |
| **`frameMode`** | ⚠ **parsed and DISCARDED** — `case "--frameMode": break; // always style-aware` |

**`frameMode` is dead plumbing, NOT a lying control.** It is hardcoded to `"frameless"` in two UI
sites (`CaptureLayoutModal`, `layoutBuilder`), defaulted again in Rust, written into every saved
preset, passed on the agent command line — and dropped. **No user can choose it**, so no promise is
broken and neither Help nor the tour mentions it.

> The risk is a **trap, not a defect**: the plumbing is complete and inviting. Someone adding a
> "frameless windows" checkbox later would wire it to what already exists and ship a dead control
> pre-built — `openMode` a second time. Removing the parameter across UI, Rust and the agent is the
> cure; it spans **both repos**, so it is recommended rather than done.

**And the detector over-reported again — the third time in this audit.** A single-line scan for
`case "--x": break;` flagged **four** discarded arguments. Three were false: `--grid-size`,
`--target-hwnd` and `--cell-margin-px` all assign on a *following* line. Only `frameMode` survived
reading. Had the four been reported as found, the headline would have been *"the window margin setting
does nothing"* — alarming, and wrong.

---

## §4B — Global shortcuts: **the chain IS wired; three different failures look identical**

Operator, 2026-08-27: *"the Global shortcuts, they dont seem wired."*

**Traced end to end, and every link is present:** Rust registers Show, Snap and `Ctrl+Alt+1–9`; the
handler emits `insta://hotkey/quickpreset` / `insta://hotkey/snap` on press; **and both events have
live listeners** — `MonitorSelector.tsx:244` runs the Quick Preset, `BottomControls.tsx:230` runs
Snap. Nothing is unwired.

**So why does nothing happen? Because three unrelated causes produce the same silence, and the app
distinguishes none of them:**

1. **There is no Quick Preset in that slot.** The Sandbox's `quickpresets/` directory is **empty** —
   the operator deleted every QP on 08-26. Rust returns *"Quick Preset not found."* and the UI
   flashes the error… **inside the InstaDesk window**.
2. **Registration failed silently.** Startup does `let _ = gs.register(...)` at all three sites
   (lib.rs 302, 305, 308), discarding the `Result`, with the comment *"Failures … are ignored so
   startup never breaks."* If another app already owns `Ctrl+Alt+3`, that key never works and
   **nothing ever says so**. Note the asymmetry: the *rebind* path (line 115) does return its Result,
   so a rebind failure surfaces — only the defaults fail quietly.
3. **It worked.** The confirmation also appears only in the InstaDesk window.

> **A GLOBAL shortcut delivers its feedback in a window that, by definition, is not focused when you
> use one.** Success, empty slot and dead registration are visually identical from where the user is
> standing. This is the *empty value asks how it became empty* rule: one observation — "nothing
> happened" — carrying three meanings whose remedies are completely different.

**Recommended, in order:**
- **Capture the registration Results at startup** and surface which hotkeys are unavailable (Settings
  can name them). A silent failure is never the right answer; "ignored so startup never breaks" is
  right about not crashing and wrong about not telling.
- **Give a global action global feedback** — the app already ships a native overlay for Snap, so the
  mechanism exists. *Design decision: operator to rule on what form it takes.*

---

## §4C — `frameMode`: the information needed to rule on it

The operator asked for more before deciding. **It is not merely unwired — it was deliberately
abandoned, after a user-reported regression.**

**What it was.** InstaDesk used to tile *permanently frameless*: strip `WS_CAPTION` / `WS_THICKFRAME`
so tiles butt together with no chrome. Pixel-perfect, and it broke windows:

- the **title bar ended up offscreen** — the agent's own comment: *"the title bar lived offscreen
  anyway"*;
- combined with `DWMNCRP_DISABLED`, it *"killed the entire non-client paint pipeline"*, which
  surfaced as **"no close button"** — recorded in the source as a **user-reported regression on Win11
  File Explorer tiles**.

**What replaced it.** `SimpleTilePosition` keeps the title bar inside the cell, and DWM rendering is
restored to `USEWINDOWSTYLE`. The frameless trick survives **only as a transient**:
`AtomicFramelessThenRestore` strips the styles *for the duration of the move* to stop border fights,
then puts them back. The window always ends up normal — and the agent hardcodes `frameMode = "normal"`
in what it reports.

**So the three options are:**

| | |
|---|---|
| **A — Delete the parameter** (UI hardcodes, Rust field, agent arg) | It names a behaviour that was removed **on purpose** after breaking real windows. Keeping complete plumbing for it is a loaded gun: the next person to add a "frameless" checkbox wires it to what exists and ships a dead control. Spans **both repos**. |
| **B — Re-implement it as a real option** | A genuine feature (chrome-free tiling), but it reintroduces exactly what was rolled back unless the geometry keeps the title bar on-screen and DWM paint intact. Real work, and it re-opens a closed regression. |
| **C — Leave it, documented** | Costs nothing today; the trap stays. |

**Recommendation: A.** The behaviour was withdrawn for cause, and nothing in the product offers it.

---

## §4D — **Every backend error message in the app was being thrown away**

Operator, 2026-08-27, after confirming the hotkeys work: *"when I use the hotkey for a Quick preset
that doesnt exist, only a red text 'error' message appears, it doesnt say what the error is."*

Rust returns a perfectly good message — `Err("Quick Preset not found.")`. It never reached the screen.

**Cause: `invoke` rejects with the RAW STRING**, not an `Error`. The whole app catches with
`(e as Error).message`, which on a string is `undefined`. The red styling survived; the words did not.
**27 catch blocks** share the pattern, so this was never one broken message — it was *every* backend
error in the product.

**Why it hid for so long — two reinforcing reasons:**

1. **The dev fallback throws real Errors.** `request()` does `throw new Error(...)`, so the identical
   code path **works in the browser and fails only in the packaged app**. The dev loop could not show
   it.
2. **It had already been met, and patched in one place.** `CaptureLayoutModal.tsx:180` reads
   `(e as Error)?.message ?? String(e)` — a read-time workaround at 1 site out of 27, never swept.
   *Fix the dialect, not the reader:* a read-time fix must be remembered by everyone forever, and it
   never is.

**Fixed at the boundary.** `services/errors.ts` normalises anything a rejection can carry into a
readable `Error`, and all **32** `invoke` sites in `api.ts` now go through it. Every existing catch
block works unchanged and every future one is correct without its author knowing any of this. Nothing
else in the app calls `invoke` directly — verified, so nothing bypasses the normalisation.

Tests written first and witnessed red (`Cannot find module './errors'`), including the operator's
exact case and one asserting the message can **never** be empty — *an error the user cannot read is
indistinguishable from no error at all* — plus one rejecting `[object Object]`, which is non-empty and
equally useless. **43 tests green.**

> ⚠ **Remaining, and NOT fixed here: backend messages are English only.** `"Quick Preset not found."`
> comes from Rust, which has no access to the locale files, so a Spanish user now sees an English
> sentence where before they saw nothing. Better, and still not right. Mapping the handful of known
> backend errors to translated strings is a separate decision — **operator to rule**.

---

## §5 — What this audit did NOT cover

Stated so the green result is not read as wider than it is:

- **The Rust and WinAgent surfaces.** Probe D only asks whether the UI invokes each registered
  command; it says nothing about dead code *inside* Rust, or agent verbs nothing calls.
- **Assignment fields the agent may ignore.** `frameMode`, `activate`, `topmost`, `waitReadyMs` are
  written into saved Layouts; whether the agent honours each one was **not** measured. This is the
  same shape as `openMode` and is the most likely place for another instance.
- **Controls that are wired but wrong.** This audit finds things nothing acts on, not things that act
  incorrectly.
- **The 7 blind spots**, listed by the tool, remain unanalysed by probe B.

---

## §6 — Recommendation

1. **W-1, edit a Favorite** — highest value, and the class the operator has now hit twice. The
   service function already exists; the work is a UI affordance, and it is smaller than the URL group
   equivalent because a Favorite is one path or URL, not a list.
2. **W-2, clear all Favorites** — one button; closes the asymmetry with App History.
3. **W-3, the clipboard module** — decide: wire a copy affordance, or delete the module. A capability
   nothing can reach is a maintenance cost with no user.
4. **Sweep the agent-honours-it question** (§5, second bullet). That is where the next `openMode`
   most likely lives, and this audit cannot see it.
5. Deleting the four dead symbols and un-exporting the eight is hygiene, not urgency.

---

*Audited 2026-08-27 against `ui/src` and `src-tauri/src/lib.rs`. Instrument committed as
`ui/scripts/audit-wiring.mjs` so the measurement is reproducible. No code changed.*

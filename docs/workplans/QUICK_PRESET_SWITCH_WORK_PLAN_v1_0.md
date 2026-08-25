# Quick Preset Switch Mode — Work Plan v1.0

> **The single document of record for this programme.** Phase 1 of the ratified method
> (`docs/SESSION_RESUMPTION.md` §0). Evidence base:
> `docs/workplans/QUICK_PRESET_TOGGLE_INVESTIGATION_v1_0.md` — read it first; this plan does not
> repeat its findings, it consumes them.
>
> Opened **2026-08-24**, on top of the closed v0.4.0 programme. Target release: **v0.5.0**.
> Rollback point for the whole programme: **`v0.4.0`** (`b5120e1`).

---

## §0 — How to use this plan (the anti-drift protocol)

1. **Consult this plan before acting; update it in the same turn after.** Both duties or neither.
2. **One place per fact.** This plan holds increment status. `CHANGELOG.md` holds what shipped.
   `docs/SESSION_RESUMPTION.md` gets a pointer at the end, never a copy.
3. **Nothing happens off-plan.** A mid-flight finding is recorded in §8 at once and then left
   alone, unless it is *shown* to make authorised work wrong.
4. **A check is written BEFORE the code it guards, and is proven to BITE before it is trusted.**
   Paste the bite-test transcript into the increment's Status block. A check nobody has seen fail
   is not evidence — and so is a check nobody has seen pass on a known-good input.
5. **Verify, never assume.** Re-derive every number at the moment you need it. Never quote one
   from this document back into a decision.

Each increment carries: **Objective · Re-investigation · Steps · Dry run · Done when ·
Verification · Status**. An increment marked **RISKY** gets a disposable local `pre-*` tag cut
*before* the first edit (`docs/RELEASING.md §7`), and is reset to it rather than left half-wired.

---

## §1 — What is being built (settled design)

**Switch mode** — a general on/off control in the Quick Presets block of the left pane, **default
off**. Operator's ruling, 2026-08-24:

> *"I click on apply preset, and the app implements the selected preset, but if I click on a
> second preset, the mechanism closes the existing implemented preset and open the new preset,
> and so forth and so on."*

With Switch mode **off**, Apply behaves exactly as it does in v0.4.0 — additive, nothing is
closed. Nothing changes for an existing user who never touches the switch.

With Switch mode **on**, applying a Quick Preset:

1. takes down the windows of the **currently live** preset — and only those windows;
2. reports honestly what it could not take down, and why;
3. then applies the new preset and records it as live.

**The spine of the programme is window ownership.** The agent already resolves the exact `HWND`
of every window it places, by snapshot-diff excluding the pre-launch window set — that is
precisely "the windows this Apply created" — but it does not emit it, and the `processId` it does
emit is unusable (investigation F-8). Emitting that handle, threading it through Rust, and keeping
a per-preset ownership record is the bulk of this work. Everything else is a consequence of it.

**Teardown is verify-then-report, never fire-and-forget** (investigation F-10). Post `WM_CLOSE`,
then poll the tracked handles for a bounded interval and classify each one:

| Outcome | Meaning | Told to the user? |
|---|---|---|
| `closed` | the window is gone | counted |
| `stillOpen` | save prompt pending, or the user declined it | **yes, named** |
| `skippedElevated` | runs as administrator; Windows UIPI forbids it (e.g. iVMS-4200) | **yes, named, with the reason** |
| `stale` | already gone before we asked | counted, not an error |

Operator rulings folded in: the elevated window is **a report, not a blocker** (D-1); nothing with
unsaved work is destroyed — the app's own save prompt is respected, and a declined prompt is
reported rather than overridden (D-2).

**Why one general switch and not one per preset.** The behaviour is a property of the
*transition*, not of a preset. A per-preset flag is ambiguous the moment a preset with it ON is
replaced by one with it OFF — the outgoing preset's flag and the incoming preset's flag both have
a defensible claim, users read it as the incoming one, implementers land on the outgoing one. One
control, two meanings, and this project's recorded failure mode is taking the reassuring reading
of exactly that shape. A general switch also leaves `QP_{SLOT}.json`, `quickpresets_save` and the
manager UI untouched, and remains a strict subset — a per-preset override defaulting to "follow
the global setting" can be added later without a data migration.

---

## §2 — Governing invariants

### 2.1 Programme-specific — this feature closes windows

**⛔ I-1 — No test fixture in this programme may reference `Code.exe`, in EITHER data dir.**
VS Code hosts the Claude Code session; a teardown that reaches it self-terminates. This is not
theoretical, and it is true of **both** Sandbox flavours — they read **different** data dirs
(`init_paths()` uses `app_data_dir()` only when staged bundle resources exist, so the packaged
Sandbox uses AppData while the dev Sandbox falls back to the repo):

| Flavour | Data dir | Offending fixtures, verified 2026-08-24 |
|---|---|---|
| **Installed** Sandbox (desktop icon) | `%APPDATA%\com.fcxestudios.instadesk.sandbox\` | `general_B.json` → `Code.exe --new-window`; reachable from `QP_A` ("xxx") |
| **Dev** Sandbox (`--dev`) | `C:\FcXe Studios\Instadesk\data\` | `general_A.json`, `general_E.json`, `general_F.json` → `Code.exe`; **`general_A` is reachable from `QP_A`** ("General Framework + Obsidian") |

Exercising the teardown against the fixtures already on disk would put VS Code windows into the
ownership record and then close them — **in either flavour**. **I-1 replaces the fixtures in both
dirs before anything can be torn down**, and no increment after it may test against a Layout that
names `Code.exe`. **Nor may any fixture use Notepad** — see the 2026-08-24 amendment: Win11's
`System32
otepad.exe` is a stub for the packaged Store app, which opens documents as **tabs**, so the
agent finds no new window and falls through to seizing an existing one — and the operator keeps a
Notepad open with unsaved work. **Test on Edge and File Explorer**, both verified in I-1 to spawn their
own windows.

`data/presets/*.json` is gitignored (`.gitignore:34`), so this is a purely local change with no
commit obligation — and equally, no version control to recover it from. Back the originals up
before replacing them.

**⛔ I-2 — The teardown may only ever act on handles in the ownership record.**
It must never enumerate the desktop. `FindAllNonInstaDeskWindows` is the enumeration behind
"Close all windows"; the new verb must not call it, directly or transitively. A window the user
opened by hand is not in the record and is therefore untouchable by construction.

**⛔ I-3 — A stored handle is revalidated before it is used.**
Windows recycles `HWND` values. A handle is acted on only if it still resolves to a window, that
window's executable still matches what was recorded, and the ownership record belongs to the
current Windows session. A stale record must degrade to "nothing to take down", never to
"close whatever that handle points at now".

**⛔ I-4 — Nothing is force-killed, ever.** `WM_CLOSE` only. No `TerminateProcess`, no
`Process.Kill`, no `--force`. The application decides; the user answers its prompt; we report.

### 2.2 Standing project invariants that bind this work

1. Never `Stop-Process -Name Code`; never smoke-test `/launch` on `Code.exe`.
2. Ship via published signed releases only.
3. The Sandbox gate is unconditional (`RELEASING.md §3.5`).
4. Gate every UI change on `npm run build`; every `src-tauri` change on `cargo test --lib && cargo build --lib`.
5. EN/ES i18n parity — currently exactly **595 = 595** leaf keys. Re-derive; do not quote this.
6. **WinAgent change → commit + push the WinAgent repo BEFORE the app-repo tag.** The release
   robot builds the agent from that repo's HEAD. Dormant through all of v0.4.0; **live again from
   I-4 onward** (investigation F-6).
7. After any `Program.cs` change, run `node src-tauri/scripts/build-agent.mjs` **before** testing
   via `sandbox.mjs --dev` — `--dev` runs the *bundled* agent, not the dev-tree one.
8. Never start a release build while a dev Sandbox is alive — both write
   `src-tauri/binaries/InstaDesk.WinAgent.exe`.

---

## §3 — The gates

The four `prebuild` gates from v0.4.0 are permanent infrastructure and bind this work unchanged.
This programme adds two instruments of its own, each written before the code it guards:

| Gate | Where it runs | Guards |
|---|---|---|
| `check-tour-safety.mjs` **(extended, I-2)** | `npm run build` → `prebuild` | the new teardown verbs can never be fired from walkthrough code |
| Rust revalidation tests **(new, I-5)** | `cargo test --lib` | a recycled, mismatched or cross-session handle is refused before any close is posted |

**⛔ Never weaken a gate to stop it complaining.** If one fires on a false positive, make it more
precise and re-bite it in both directions.

---

## §4 — Rollback policy

- **Programme rollback point: `v0.4.0`** (`b5120e1`), verified this session with `git tag -l`.
- Each **RISKY** increment cuts a local `pre-*` tag before its first edit. Planned:
  `pre-qp-switch-v1`, `-agent-hwnd`, `-ownership`, `-agent-close`, `-switch-cmd`, `-ui`.
- **⚠ A git tag only protects tracked files.** Before cutting one, check that the increment's risk
  surface is actually in git. **I-1 is not** — its files are gitignored or live in `%APPDATA%` — so
  its rollback point is a verified file backup instead. A tag that covers nothing the increment
  touches is a rollback point in name only.
- Tags stay **local** (`RELEASING.md §7`); confirm 0 remote copies.
- A half-wired increment is **reset to its tag**, never left as "done".

---

## §4A — How the operator sees each build (settled 2026-08-24)

**Operator ruling: validation happens in the *installed* Sandbox, opened from the desktop icon**
— `C:\Users\FABIAN C\Desktop\InstaDesk Sandbox.lnk` → `%LOCALAPPDATA%\InstaDesk Sandbox\InstaDesk-Sandbox.exe`,
confirmed present. Two Sandboxes exist and they are easy to confuse; this fixes which is which.

**Two tracks, and they do not overlap:**

| | Who | How | Why |
|---|---|---|---|
| **Iteration** | me | `node src-tauri/scripts/sandbox.mjs --dev` | hot reload, and the **DEV panel exists only here** |
| **Validation** | operator | the desktop icon, refreshed by `--publish` | the real packaged product, the thing that actually ships |

**⚠ The trap this closes.** `tauri.sandbox.conf.json` carries **no `version` field**, so a plain
`sandbox.mjs` installer build inherits `0.4.0` — byte-different from the last build but reporting
an identical version. The operator would have no way to tell whether the icon they just clicked is
the new build or yesterday's. The badge and the window title do not change either.

### §4A.1 — `--publish` was assessed and REJECTED for this programme

The operator challenged the first draft of this section on the grounds that *"our GitHub
publishing Robot only handles official versions, not Sandboxed versions."* **That is correct, and
verifying it invalidated the recommendation.** Assessment, 2026-08-24:

**a) The robot genuinely cannot touch a Sandbox build.** `.github/workflows/release.yml` is the
only workflow in the repo and its trigger is `on: push: tags: - 'v*.*.*'`. The tag
`sandbox-channel` does not match. And `--publish` pushes no tag at all: the channel has existed
since 2026-06-29, so the script's `channelExists` branch skips `gh release create` and runs only
`gh release upload … --clobber`, which attaches assets to an existing release without creating any
ref. **No robot involvement is possible.** The operator's understanding is confirmed.

**b) But `--publish` still uploads, and the repo is PUBLIC.** The build runs locally
(`npx tauri build` on the workstation); the finished installer and `latest.json` are then pushed
straight to GitHub by the `gh` CLI. `gh repo view` reports
`FCCXE/InstaDesk-V2.0` → **`visibility: PUBLIC`**. So a published Sandbox build is downloadable by
anyone holding the URL. Not a robot run — a direct upload to a public host.

**c) And it would not have worked anyway.** The installed Sandbox reports
**`ProductVersion 0.4.0`** (verified from the exe's version resource; a plain build, made
2026-08-24 17:14), because `tauri.sandbox.conf.json` carries no `version` and inherits
`tauri.conf.json`'s. A published build stamps `0.4.0-sb.<ms>` — and **in semver a prerelease
sorts BELOW its release**, so `0.4.0-sb.1783…` is *older* than `0.4.0`. The updater would offer
nothing. The script's comment (*"monotonic → installed Sandbox sees newer builds"*) holds only
once the installed Sandbox is itself an `-sb.<ms>` build; bootstrapping that requires a
hand-installed publish build first, which defeats the purpose. The stale
`0.2.1-sb.1783872059966` sitting on the channel since 2026-07-12 is invisible to the operator's
Sandbox for the same reason.

### §4A.2 — Settled: local installer builds, version-stamped

**Nothing in this programme is uploaded.** Operator-facing builds are plain, local, and installed
by double-click — which is what `RELEASING.md §3.5` has always described:

```
node src-tauri/scripts/sandbox.mjs
→ src-tauri/target/release/bundle/nsis/InstaDesk Sandbox_<version>_x64-setup.exe
```

It upgrades **only** the Sandbox app, side by side with stable, and never touches the operator's
real InstaDesk.

**The build-identity problem is solved locally instead.** `sandbox.mjs` gains a version stamp for
plain builds — the same mechanism the publish branch already proves works (temp config with
`version = <base>-sb.<ms>`, plus `INSTADESK_VERSION_OVERRIDE` so the header shows it), but with
**no signing key, no updater artifacts, and no upload**. Each build then carries a unique
`0.4.0-sb.<ms>` in the installer filename *and* on screen, so the operator can always tell which
build is running. Delivered as **I-1b**; the semver ordering that broke the update path is
irrelevant here, because nothing compares versions — the operator runs the installer.

**Also verified while assessing this:** `ui/src/services/version.ts:8-10` claims `IS_SANDBOX`
*"disables auto-update (services/updater.ts)"*. **It does not.** `IS_SANDBOX` is referenced in
exactly two places — its own definition and `TopChrome.tsx:55` (the badge) — and never in
`updater.ts`. What actually isolates the Sandbox is the endpoint override in
`tauri.sandbox.conf.json`, which `updater.ts`'s own comment describes correctly. A comment
asserting a safety property the code does not implement, same class as the recorded `backend.rs`
agent-path comment. **Recorded under the parking rule (§0.3); not fixed by this programme.**

**Consequences that bind the increments:**

1. **The DEV panel does not exist in a packaged build** (`import.meta.env.DEV`). Anything
   verifiable only through it must be verified by me in `--dev`, **before** an operator build is
   published. **I-7 is amended accordingly.**
2. **Operator checkpoints are placed where there is something real to see** — after I-9 (the
   switch works), after I-10 (the report is honest), and at I-14 (the release candidate). Earlier
   increments have no operator-visible surface and are verified by gates and transcripts.
3. **Nothing is uploaded** (§4A.1). No `--publish`, no `sandbox-channel`, no `gh release`
   anywhere in this programme. Every operator build is a local file the operator double-clicks.
4. Never start an installer build while a dev Sandbox is alive — both write
   `src-tauri/binaries/InstaDesk.WinAgent.exe` and the loser fails with `os error 32`, which can
   yield a binary of the right size that is quietly broken.

---

## §5 — Increment dashboard

| # | Increment | Risky? | Gate | Status |
|---|---|---|---|---|
| I-0 | Programme setup — rollback tag + records committed | no | git | ✅ `08bdc05` |
| I-1 | **Safe Sandbox fixtures** — remove `Code.exe` from every test Layout | **yes** | manual + Sandbox | ✅ |
| I-1b | **Version-stamp local Sandbox builds** so the operator can tell them apart | no | build + install | ✅ |
| I-2 | **Extend tour-safety check** with the new verbs, before they exist | no | build | ☐ |
| I-3 | **HWND spike** (throwaway) — is the handle usable, and how does it die? | no | Sandbox `--dev` | ☐ |
| I-4 | WinAgent: emit `hwnd` in the launch result | **yes** | agent + Rust + Sandbox | ☐ |
| I-5 | Rust: parse the agent result + **revalidation tests written first** | **yes** | cargo | ☐ |
| I-6 | WinAgent: `--close-tracked` verify-then-report verb | **yes** | agent + Sandbox | ☐ |
| I-7 | Rust: ownership record + the switch command | **yes** | cargo + Sandbox | ☐ |
| I-8 | `api.ts` + `AppState`: switch state and the new call | no | build | ☐ |
| I-9 | UI: the Switch mode control + anchor + EN strings | no | build + Sandbox | ☐ |
| — | **▶ OPERATOR CHECKPOINT 1** — `--publish`, then desktop icon → Check for updates | — | installed Sandbox | ☐ |
| I-10 | UI: the outcome report — what could not be closed, and why | no | build + Sandbox | ☐ |
| — | **▶ OPERATOR CHECKPOINT 2** — the honest report, incl. the iVMS-4200 case | — | installed Sandbox | ☐ |
| I-11 | Tour: anchor registry, chapter step, content truth (F-7) | no | build | ☐ |
| I-12 | ES parity sweep | no | build | ☐ |
| I-13 | Telemetry | no | build | ☐ |
| I-14 | Release v0.5.0 — Sandbox installer gate, CHANGELOG, bump, two-repo push, tag | **yes** | full | ☐ |

---

## §6 — The increments

### I-0 — Programme setup ☐

**Objective.** A safe place to return to, and the records in the repo before any code moves.
**Re-investigation.** Confirm both repos are `main == origin/main` and carry only the known
untracked entries (app: `docs/marketing/`, `ui/public/brand/FLCX Studios.png`; WinAgent: 2 SVGs +
`instadesk-tauri/`).
**Steps.** Cut `pre-qp-switch-v1` at current HEAD. Commit the investigation and this plan with
**explicit file paths** — never `git add -A`, and never `git add` `instadesk-tauri/` from the
WinAgent repo. **Also repoint `docs/SESSION_RESUMPTION.md` §8** — it currently states the next
front is *"not yet investigated, scoped, or designed"*, which is now false and would send the next
session to redo Phase 0. A **pointer only**, per §0.2: name the two documents and the settled
reading; the status stays here.
**Dry run.** n/a — no app code.
**Done when.** `git tag -l 'pre-qp-switch-v1'` returns the tag; the three files are committed and
pushed; the untracked entries are still untracked.
**Verification.** `git tag -l` (**not** `rev-parse` — it echoes a missing tag back as a false
positive); `git diff --cached --stat` reviewed and confirmed to be exactly 2 files before the
commit lands; commit message read back from `git log -1` after committing (this session's Bash is
POSIX `sh`; use a heredoc or `-F <file>`, never a PowerShell here-string).

**Status. ✅ DONE 2026-08-24.** Commit **`08bdc05`**. Verification record:

- **Re-investigation:** both repos re-fetched and confirmed `main == origin/main`, **0 ahead / 0
  behind** — app `b6f1286`, WinAgent `dd80f84`. App repo carried only the two known untracked
  entries plus the two new documents; WinAgent repo carried only its two SVGs and
  `instadesk-tauri/`. **The WinAgent repo was not touched** — nothing in I-0 belongs to it.
- **Tag `pre-qp-switch-v1`** cut at `b6f1286`. **Verified with `git tag -l`**, not `git rev-parse`
  — the latter echoes a missing tag's name back and reads as a false positive. Confirmed to point
  at the same commit as HEAD-at-the-time, and confirmed **local only: 0 remote copies**
  (`git ls-remote --tags`), per `RELEASING.md §7`.
- **Handbook §8 repointed** — its *"not yet investigated, scoped, or designed"* text was false the
  moment Phase 0 closed and would have sent the next session to redo the investigation. Replaced
  with a pointer to both documents plus the three things a resuming session must know
  (Program.cs / two-repo rule live; closes windows so no `Code.exe` fixtures; nothing uploaded).
  The stale starting-evidence list was removed rather than corrected — it lived in the wrong place
  (§0.2) and had already been caught understating the QP anchors as four when there are five.
- **Edited via Python temp-file + `os.replace`**, with assertions on the anchor text before the
  write and a read-back after it (`'not yet investigated' not in back`, `§9` still present exactly
  once). Not via a Bash heredoc — the recorded trap is that a heredoc eats backslashes and the
  damage is invisible on read-back.
- ⚠ **Instrument fault caught, and it was the instrument.** The script's success message printed
  as mojibake (`OK � block replaced`). That was the **console** codepage (cp1252), not the file:
  a byte-level check confirmed the file is clean UTF-8, **no BOM**, 30 `§` marks intact, and none
  of the three mojibake signatures present. Suspect the instrument before the program — but
  **check**, rather than assuming either way.
- ⚠ **One real defect caught by reading the result back:** the new heading used `⛑` (U+26D1)
  instead of the handbook's `⚑` (U+2691). Cosmetic, but it was found by *looking at the rendered
  block*, not by any assertion — the assertions all passed. Normalised in a second pass with a
  uniqueness assertion.
- **Staged with explicit paths**; `git diff --cached --stat` reviewed **before** the commit landed:
  exactly **3 files, 1145 insertions, 22 deletions**. `docs/marketing/` and
  `ui/public/brand/FLCX Studios.png` confirmed still untracked and **not** swept in.
- **Commit message read back from `git log -1 --format=%B`** rather than trusting the commit's
  exit code — em-dashes intact, no literal `@` wrapping, co-author trailer present.
- **Pushed and re-verified after an explicit `git fetch`:** `HEAD == origin/main == 08bdc05`,
  0 ahead / 0 behind. Working tree back to exactly the two known untracked entries.

---

### I-1 — Safe Sandbox fixtures ☐ **RISKY** → rollback is a **verified file backup**, not a git tag

> **Amendment (2026-08-24), before acting.** This increment was scheduled to cut
> `pre-qp-switch-fixtures`. **A git tag would have protected nothing here** — every file I-1 touches
> is outside version control: `data/presets/*.json` is gitignored (`.gitignore:34`) and the
> installed Sandbox's fixtures live in `%APPDATA%`. The tag would have pointed at an app-repo state
> this increment never changes, i.e. an identical commit to `pre-qp-switch-v1`. Cutting it would
> have produced a rollback point that looks like protection and provides none — a check rotting
> into decoration, which §3 forbids. **No tag is cut. The rollback point is a copy of both fixture
> sets, taken first and verified by reading it back.**

**Objective.** Make it impossible for any later increment to tear down VS Code. This must land
**before** any teardown code exists, not before it is first tested — the ordering is the point.
**Re-investigation.** Re-enumerate every Layout and Quick Preset in **both** Sandbox data dirs
(§2.1 table) and grep each for `Code.exe`. Re-derive; the findings recorded there were true on
2026-08-24 and must be re-confirmed, not trusted — and the dev-dir hits (`general_A`, `_E`, `_F`)
were found only *after* the installed-dir hit, which is exactly why both get re-swept.
**Steps.** Back up the existing fixtures in both dirs first — `data/presets/*.json` is gitignored,
so there is nothing to recover them from. Then author dedicated fixtures — **Notepad and Edge**,
two Layouts and two Quick Presets, deliberately overlapping in one app so the "same app in both
presets" case is exercised. Remove or rewrite every fixture naming `Code.exe` in **both** dirs.
**⛔ The stable app's data dir (`%APPDATA%\com.fcxestudios.instadesk\`) is out of scope and must
not be touched** — that is the operator's real working setup.
**Dry run.** Apply each new fixture with Switch mode absent (it does not exist yet) and confirm
windows land — proving the fixture is valid before it is ever a teardown target.
**Done when.** A grep for `Code.exe` across **both** Sandbox data dirs returns **nothing**, and
the new Quick Presets apply cleanly.
**Verification.** Paste the grep for each dir separately (showing zero hits in each — a single
combined grep would let one dir hide behind the other), the fixture listing, the backup location,
and a note confirming the stable app's data dir is unmodified.

**Status. ✅ DONE 2026-08-24.**

- **Re-investigation** re-derived both dirs independently and matched §2.1: DEV `general_A/_E/_F`
  named `Code.exe` (`general_A` reachable from its `QP_A`); SBX `general_B` named it (reachable
  from its `QP_A`).
- **Rollback point = backup, not a tag** (amendment above). **10 files** copied to
  `C:\Users\FABIAN C\AppData\Local\InstaDesk-fixture-backups\pre-qp-switch-2026-08-24\`, each
  verified by **SHA-256 comparison of source and copy** — not by trusting that `copy2` returned.
- **Minimal-damage edit, not wholesale replacement.** Only the offending *assignments* were
  stripped, leaving the operator's dev Layouts otherwise intact: DEV `general_A` 7→6,
  `general_E` 7→6, `general_F` 6→5; SBX `general_B` 4→3. Dedicated fixtures added in **free slots
  S and T** — asserted free before writing, so nothing was clobbered — identical in both dirs so a
  test behaves the same whichever Sandbox runs it.
- **Sweeps run separately per dir, both ZERO** — a single combined grep would let one dir hide
  behind the other.
- **The sweep was proven to BITE**: a planted `X:\Code.exe` fixture was detected, then removed and
  the sweep returned to zero. A sweep nobody has seen fail is not evidence.
- **Dry run:** every assignment launched through the agent with the app's **own** flag construction
  (mirrored from `agent_flag_args`, read from source, rather than invented). All returned
  `ok:true` with `DWMBounds` exactly equal to the computed tile. Verified present afterwards with
  the DPI-aware capture, before/after: Edge mon 1 `3,1,2,4` + Edge mon 3 `1,1,4,4`; Explorer
  created **its own new window** and left the operator's `Downloads` window untouched.
- **Desktop restored:** 4 windows I opened closed by graceful `WM_CLOSE` to their specific handles
  (never by PID — see below, and never force-killed). Final capture: **14 windows, 0 leftover
  Edge**, only the operator's `Downloads`, and their Notepad holding **unsaved work** still intact
  at monitor 2. **The operator's real data dir (`com.fcxestudios.instadesk`) was never touched** —
  its files still carry their June timestamps.

**Three findings, all recorded in §8 and carried into later increments:**

1. **F-8 is broader than the investigation recorded.** All **three** first launches — including
   Notepad — reported a `processId` that was already dead seconds later. Not browser-specific.
2. **Notepad was rejected as a fixture app** and the plan's own "test on Notepad and Edge" was
   corrected mid-increment. Win11's `System32\notepad.exe` is a stub for the packaged Store app,
   which opens documents as **tabs**; with no new window to find, the agent falls through to
   *"any existing window"* — and the operator has a Notepad open **with unsaved work**. Replaced
   with Edge + File Explorer, both verified to spawn their own windows.
3. ⚠ **An absence in a capture is not proof of absence.** `--capture-layout` reported **no**
   Explorer window on monitor 1 immediately after a launch that had just succeeded; a later
   enumeration found **two** such windows had in fact existed. A window-list snapshot can omit a
   live window. **I-6's verify-then-report must establish "gone" by probing the handle itself
   (`IsWindow` + executable match), never by a window absent from a snapshot** — otherwise the
   teardown reports a window closed because it failed to see it. This is the recorded
   *"an empty value asks HOW it became empty"* rule, and the reassuring reading here would be
   "closed".

---

### I-1b — Version-stamp local Sandbox builds ☐

**Objective.** Make every operator-facing build distinguishable **without uploading anything**
(§4A.2). Today a plain Sandbox build reports `0.4.0` regardless of what changed, and the badge and
window title are identical across builds — so the operator has no way to confirm they are testing
the build I just handed them. That is not a convenience; it is the difference between a
verification and a guess.
**Re-investigation.** Confirm `tauri.sandbox.conf.json` still carries no `version` field, and
re-read the `--publish` branch of `sandbox.mjs` — it is the working proof of the mechanism being
copied (temp config + `INSTADESK_VERSION_OVERRIDE`), and the copy must not drag along the signing
key, `createUpdaterArtifacts`, or any `gh` call.
**Steps.** Give plain (non-`--dev`) builds a stamped version `<base>-sb.<ms>` via a temp config,
with `INSTADESK_VERSION_OVERRIDE` set so the header shows it. **No signing key, no updater
artifacts, no upload.** Clean up the temp config on both success and failure paths, as the publish
branch does.
**Dry run.** Build once; confirm the installer filename carries the stamp and the temp config is
gone afterwards.
**Done when.** Two consecutive builds produce **different** stamps, and the version shown in the
installed app's header matches the installer filename it came from.
**Verification.** Both installer filenames, the on-screen version after installing the second one,
and a `git status` showing no stray temp config left behind. **Prove it by installing the second
build over the first and watching the number change** — a stamp that is only read from a filename
proves nothing about what the running app reports.

⚠ Semver ordering (`0.4.0-sb.N` sorts *below* `0.4.0`) is deliberately irrelevant here: nothing
compares these versions, because there is no update feed in this path. Do **not** "fix" the
ordering — that would be re-inventing the publish flow §4A.1 rejected.

**Status. ✅ DONE 2026-08-25.**

- **Re-investigation** confirmed at the moment of editing: `tauri.sandbox.conf.json` still declares
  **no `version`** and `bundle.createUpdaterArtifacts: false`; base version `0.4.0`;
  `sandbox.mjs` clean in git.
- **Implementation:** non-`--dev` builds now write `src-tauri/.sandbox-build.tmp.json` carrying
  `version = <base>-sb.<ms>`, set `INSTADESK_VERSION_OVERRIDE` so `vite.config.ts` stamps the UI
  header, and delete the temp config **on both the success and failure paths** — a leftover would
  outlive its build and silently pin the next one to a stale stamp. `--dev` deliberately unstamped.
- **`.gitignore` extended first**, and the rule **proven to bite**: a planted
  `src-tauri/.sandbox-build.tmp.json` was matched by `git check-ignore` and absent from
  `git status`. Without it, an interrupted build could leave an untracked file for a later
  `git add` to sweep up.
- **Verified the build path carries nothing from the publish path** — no signing key, no
  `TAURI_SIGNING*`, no `createUpdaterArtifacts`, no `gh`, no channel constants.
  ⚠ **The first version of this check was wrong and it took a comment as a leak.** It matched the
  *word* `createUpdaterArtifacts` inside my own explanatory comment. Rather than reword the comment
  to appease it — the reflex §3 forbids — the check was made to strip comments and follow **code**.
  A control then proved the stripper had not simply deleted everything (`spawnSync`, `buildCfgRel`,
  `rmSync` all still present) — a check that passes because it can no longer see anything is worse
  than the false positive it replaced.
- **Generated temp config inspected while the build was in flight:**
  `version 0.4.0-sb.1787656233895`, sandbox identity intact, `createUpdaterArtifacts: false`,
  no signing material.
- **Two consecutive builds, two distinct stamps** — `…-sb.1787656233895` (06:12) and
  `…-sb.1787656373798` (06:14). Both carried the stamp into the installer **filename**, and both
  ran all four `prebuild` gates inside the build (i18n 595=595, safety, anchors 47/47, content).
  Temp config absent after each; `git status` showed only the two intended modifications.
- **Proven where it counts, not just in the filename.** The stamp was found in the built UI bundle
  (`ui/dist/assets/index-*.js`) — vite's `define` substitutes it as a literal, so that *is* what
  the header renders. Build #2 was then **installed over build #1** and the installed exe's
  `ProductVersion` moved **`0.4.0` → `0.4.0-sb.1787656373798`**. A byte search of the shipped
  binary found build #2's stamp present and **build #1's absent**, with a control confirming the
  search finds a string that is genuinely there.
- **Side-by-side isolation re-confirmed:** stable InstaDesk still reports `0.4.0` and was still
  running throughout (PID 1480); the Sandbox's Layout fixtures kept their I-1 timestamps.

**Left for the operator:** open the Sandbox from the desktop icon and confirm the header reads
`0.4.0-sb.1787656373798`. Everything above proves the value is in the shipped binary; only a human
looking at the screen proves it is *rendered*, and gates verify structure, never what a screen says.

---

### I-2 — Extend the tour-safety check, before the verbs exist ☐

**Objective.** Close the walkthrough hazard before there is anything to fire. `quickpresets_run`
is already on the forbidden list; the new teardown verbs must join it **while they are still
imaginary**, so the instrument is proven before there is anything to measure.
**Re-investigation.** Re-derive the current forbidden list from `ui/scripts/check-tour-safety.mjs`
— the build reports "18 forbidden identifiers", but re-read them; do not trust the count.
**Steps.** Add the new command names to the list. Follow the **call**, not the name (the recorded
rule): the check must catch a tour file that invokes the switch through `api.*` as well as one
that names the Rust command directly.
**Dry run.** Run against the untouched tree → PASS. **This proves nothing on its own** and is
recorded as a control, not as evidence.
**Bite test (mandatory, both directions).** (a) Add a temporary file under `ui/src/tour/` that
calls the new verb → expect FAIL naming that file and that identifier. (b) Remove it → expect
PASS. (c) Add a file that reaches the verb via `api.` → expect FAIL. Restore byte-for-byte and
prove it with `git status`.
**Done when.** All three transcripts pasted, and the gate is **observed running inside
`npm run build`** — not assumed to be wired.
**Verification.** The three transcripts, the restored `git status`, and the `prebuild` line from a
real build.

**Status. ☐**

---

### I-3 — HWND spike (throwaway) ☐

**Objective.** De-risk the one unknown the whole programme rests on, before committing to it.
Throwaway code; nothing from this increment ships.
**Re-investigation.** Re-read `Program.cs:655-800` and confirm the snapshot-diff path still
resolves `hwnd` and still excludes `preLaunchWindows`.
**Questions the spike must answer, with evidence:**
1. Is the resolved `hwnd` the *right* window? (Read exe + title back from it and compare.)
2. For a browser launched with `--new-window` — where the launcher process exits and the window
   belongs to a pre-existing `chrome.exe` — is the handle still correct? (This is the case that
   makes `processId` useless; the handle must survive it.)
3. What does a handle look like **after** its window closes? Does `IsWindow` go false reliably?
4. Can a recycled handle be distinguished from a live one by exe comparison alone, or is more
   needed? This answers the shape of I-5's revalidation.
5. For a `multiWindowApp` assignment, how many handles come back — one, or one per window?
6. **(added from I-1's dry run)** When two assignments launch the **same browser**, does the second
   get its own window, or does it **relocate the first**? I-1 launched Edge twice with
   `--new-window` at two different placements; both returned `ok:true` with correct geometry, and
   afterwards **exactly one Edge window existed**, sitting at the *second* placement. If a second
   apply moves the first window rather than creating another, the ownership record can hold two
   entries pointing at one handle — or one entry pointing at a window that has since been moved by
   a later apply. Answer this before I-5 designs the record's shape.
**Steps.** Instrument the agent locally (uncommitted), launch Notepad and Edge via the Sandbox,
log handles, close windows by hand, re-probe. **No `Code.exe`** (invariant I-1).
**Dry run.** The spike *is* the dry run.
**Done when.** All five questions answered with pasted evidence, and the local instrumentation is
reverted — `git status` in the WinAgent repo clean.
**Verification.** The transcript, plus a clean `git status` proving nothing from the spike leaked
into I-4.

**Status. ☐**

---

### I-4 — WinAgent: emit `hwnd` in the launch result ☐ **RISKY** → tag `pre-qp-switch-agent-hwnd`

**Objective.** Make the handle available. Purely additive — one new field; no behaviour changes.
**⚠ From here on, the two-repo sequencing rule is live** (invariant 2.2.6).
**Re-investigation.** Re-read the success JSON at `Program.cs:983-1006` and confirm it still emits
`processId` and no handle.
**Steps.** Add `hwnd` (as a stable integer) to the success payload beside `processId`. Do not
remove or "fix" `processId` — out of scope, and other consumers read this JSON.
**Dry run.** `node src-tauri/scripts/build-agent.mjs`, then invoke the agent directly on Notepad
and read the JSON.
**Done when.** Every successful launch result carries a non-zero `hwnd` that resolves to the
window that was actually placed.
**Verification.** Raw agent JSON pasted. `cargo test --lib` still green (nothing in Rust parses it
yet — record that as the expected no-op). Confirm the **bundled** agent was rebuilt before any
`--dev` test, and verify its `1.0.0+<commit>` stamp against the WinAgent repo HEAD.

**Status. ☐**

---

### I-5 — Rust: parse the agent result + revalidation tests written first ☐ **RISKY** → tag `pre-qp-switch-ownership`

**Objective.** Stop throwing the handle away, and make invariant I-3 a mechanism rather than a
sentence. **The tests come before the code they guard.**
**Re-investigation.** Confirm `run_launch` still returns `{exitCode, stdout, stderr, cmd}` with
the agent JSON left inside `stdout` as unparsed text, and that `apply_preset` passes it through
verbatim.
**Steps.**
1. **Write the revalidation tests first**, in `backend.rs`'s test module, against a pure function
   that takes a recorded entry and a live probe result and returns act / refuse:
   - handle no longer a window → refuse (`stale`)
   - handle live but executable differs from the record → refuse (**recycled — the dangerous case**)
   - record's session marker differs from the current one → refuse the **whole record**
   - handle live, exe matches, session matches → act
2. Then implement the parse: pull the agent's JSON line out of `stdout`, extract `hwnd` + `exe`,
   and return it as structured data from `run_launch` / `apply_preset` — **additively**, leaving
   the existing fields in place so `results.length` and every current consumer keep working.
**Dry run.** `cargo test --lib` — the new tests must **fail** before the implementation exists
(paste that), then pass after it.
**Bite test (mandatory).** Feed the revalidator a handcrafted "recycled handle" fixture — live
window, different exe — and prove it refuses. A hand-typed payload is frozen at the moment
somebody typed it, so also drive one case from a **real** agent result captured in I-4.
**Done when.** Tests green, parse additive, no existing consumer changed.
**Verification.** The failing-then-passing transcript, the bite test, `cargo test --lib` and
`cargo build --lib` both green, and confirmation that the UI's window counts are unchanged.

**Status. ☐**

---

### I-6 — WinAgent: `--close-tracked` verify-then-report ☐ **RISKY** → tag `pre-qp-switch-agent-close`

**Objective.** The teardown primitive, honest by construction.
**Re-investigation.** Re-read `RunCloseAllWindows` (`Program.cs:2197`) and confirm it still uses
`PostMessage` + returns `affected` as a count of **requests posted**.
**Steps.** A new verb taking an explicit list of handles. For each: skip if elevated (count and
**name** it); post `WM_CLOSE`; then **poll the handle set for a bounded interval** and classify
every entry as `closed` / `stillOpen` / `skippedElevated` / `stale`. Emit per-window records with
the executable and title, not just totals.
- **Must not call `FindAllNonInstaDeskWindows`** or any desktop enumeration (invariant I-2).
- **Must not force-kill** (invariant I-4).
- `PostMessage`, not `SendMessage` — a modal save dialog must not block the sweep.
**Dry run.** Rebuild the bundled agent; invoke directly with a handle list from I-4.
**Bite tests (mandatory, three).**
1. **Unsaved work:** Notepad with unsaved text → expect the save prompt to appear, the window to
   be reported `stillOpen`, and the text to survive. Then decline the prompt and confirm it is
   *still* reported `stillOpen` — the case today's code cannot see (F-10).
2. **Elevated:** a window that runs elevated → expect `skippedElevated` **naming it**, not a
   silent omission.
3. **Untracked:** pass a handle for a window InstaDesk did not open → expect refusal by
   revalidation, not a close.
**Done when.** All three transcripts recorded, and a control run on an ordinary window shows
`closed` — a check nobody has seen pass on a known-good input is as unproven as one nobody has
seen fail.
**Verification.** The four transcripts (three bites + one control), and confirmation that no
`Code.exe` window existed in any handle list.

**Status. ☐**

---

### I-7 — Rust: the ownership record + the switch command ☐ **RISKY** → tag `pre-qp-switch-cmd`

**Objective.** Join the halves: remember what is live, and swap it.
**Re-investigation.** Confirm I-5's parse and I-6's verb both behave as recorded — re-run their
verifications rather than trusting their Status blocks.
**Steps.** An ownership record holding: which Quick Preset (or Layout) is live, its owned handles
with executables, and a **Windows-session marker** (D-3). A `quickpresets_switch` command that
revalidates the record, tears down via I-6, then applies the new preset and records it as live —
returning both the teardown outcome and the apply outcome so the UI can report the whole
transition. Inherits `locked_guard()` like every other run path.
**Dry run.** Drive the command from the Rust tests and from the **DEV panel in `sandbox.mjs
--dev`** — **not** in the installed Sandbox, where the DEV panel does not exist
(`import.meta.env.DEV`, §4A consequence 1). This increment therefore has **no operator
checkpoint**; the first one is at I-9.
**Done when.** Preset A → preset B swaps in the dev Sandbox with only A's windows closed; a
hand-opened window present throughout is untouched (the direct proof of invariant I-2); the
record survives an InstaDesk restart within the same Windows session and is **discarded** across
a reboot.
**Verification.** Dev-Sandbox transcript with the hand-opened control window named explicitly,
plus the cross-session discard proof.

**Status. ☐**

---

### I-8 — `api.ts` + `AppState`: switch state and the new call ☐

**Objective.** Wire the tier the UI will use. The switch is session state that must survive a tab
change, so it lives in `AppState`, not in a pane (standing rule; `MonitorSelector`'s `selected` is
component-local and is cleared when its entry disappears).
**Steps.** Types for the switch result; the client method; the persisted preference in `AppState`
alongside `windowMargin` / `gridSizeByMonitor`, wrapped in try/catch like its neighbours.
**Done when.** `npm run build` green with the new types unused by any component yet.
**Verification.** Build output including all four `prebuild` gates.

**Status. ☐**

---

### I-9 — UI: the Switch mode control ☐

**Objective.** The control, where the consequence happens.
**Steps.** A labelled on/off control in the Quick Presets block beside Apply, **default off**,
with a `data-tour` attribute **and** its `anchors.json` entry with `reachableWhen` **in the same
commit** — the anchor gate bites in both directions and either half alone fails the build. EN
strings only at this stage. Mind the column: the left `aside` is a finite, scrolling space inside
the fixed 1280×820 construct.
**Done when.** With the switch off, Apply is byte-for-byte the v0.4.0 behaviour — verified, not
assumed. With it on, the swap runs.
**Verification.** Sandbox `--dev` with the operator watching both states; build green.

**Status. ☐**

---

### I-10 — UI: the outcome report ☐

**Objective.** Deliver operator ruling D-1: the app says **which** window it could not close and
**why**.
**Steps.** Extend the status line / flash surface to report the transition honestly — closed
count, plus each `stillOpen` and `skippedElevated` window **named with its reason** ("runs as
administrator", "save prompt not answered"). Never report a count of requests as an outcome.
**Done when.** A swap that leaves a window behind says so, on screen, naming it.
**Verification.** Sandbox run with an elevated window and with a Notepad holding unsaved text;
screenshot or transcript of the actual message.

**Status. ☐**

---

### I-11 — Tour: registry, step, and content truth ☐

**Objective.** Keep the walkthrough true. Investigation F-7: the existing line *"This lists your
Quick Presets and your individual Layouts together — pick either"* becomes incomplete once a
switch sits beside it, and `check-tour-content` verifies grid-size claims, **not** this — the gate
would stay green while the walkthrough went stale.
**Steps.** Anchor entry (from I-9), a step in the `quickPresets` chapter, and revised prose that
tells the truth about Switch mode. Verify the safety gate still forbids firing it (I-2).
**Done when.** All four `prebuild` gates green **and** a human has read the chapter on screen —
gates verify structure; nothing verifies that prose is true.
**Verification.** Build output plus a note recording who read it and when.

**Status. ☐**

---

### I-12 — ES parity sweep ☐

**Objective.** EN/ES parity, enforced by the gate.
**Re-investigation.** Re-derive the leaf-key counts at the moment of the sweep. Do not quote the
595/595 recorded in §2.2.
**Done when.** `check-i18n-parity` reports identical sets.
**Verification.** The parity line from a real build.

**Status. ☐**

---

### I-13 — Telemetry ☐

**Objective.** Learn whether the switch is used and whether teardowns leave windows behind.
**Steps.** Mirror the existing `quickpreset_applied` shape. Emit the transition outcome including
counts of `stillOpen` and `skippedElevated`. **React state updaters must stay pure** — the
recorded `StrictMode` double-emit defect came from a side effect inside a setter.
**Done when.** Events fire once per transition under `StrictMode`.
**Verification.** Observed event log showing exactly one event per swap.

**Status. ☐**

---

### I-14 — Release v0.5.0 ☐ **RISKY**

**Objective.** Ship it.
**Re-investigation.** Re-derive the live version from `gh release list` and the two version files;
re-confirm both repos clean.
**Steps.** In order:
1. All gates green (§3) — full `npm run build`, `cargo test --lib && cargo build --lib`.
2. **Sandbox installer gate** (`RELEASING.md §3.5`) — unconditional, no rationalising a skip.
   Ensure **no dev Sandbox is alive** before building, then verify the bundled agent's PE header
   and `1.0.0+<commit>` stamp against the WinAgent repo HEAD.
3. `CHANGELOG.md` under `[Unreleased]`.
4. `bump-version.mjs 0.5.0 --dry-run`, then for real.
5. **Push the WinAgent repo FIRST** — `Program.cs` changed in I-4 and I-6, and the robot builds the
   agent from that repo's HEAD. Skipping this ships the **old** agent with the new UI.
6. Commit the app repo with explicit paths; tag `v0.5.0`; push the tag.
7. Verify the live `latest.json`, `isPrerelease:false`, 3 assets.
**Done when.** The live `latest.json` reports `0.5.0` and the operator has run the released build.
**Verification.** The `curl` and `gh release view` output, read from the live release — not from
the robot's green tick.

**Status. ☐**

---

## §7 — Open decisions

Recommendations stated; the operator overturns any of them cheaply at this stage. Each is
resolved in the increment named.

- **D-3 — Lifetime of the ownership record.** *Recommended: persist to disk, stamped with a
  Windows-session marker; discard the record when the marker differs.* The toggle then survives an
  InstaDesk restart (useful) but never acts on handles from a previous boot (dangerous — Windows
  has reused them). Resolved in **I-7**.
- **D-4 — Re-applying the preset that is already live.** *Recommended: treat it as a refresh* —
  tear down and re-apply. Consistent with "one preset live at a time", and it is how a user fixes
  a desk that has drifted. Resolved in **I-7**.
- **D-5 — Do single Layouts participate?** The left-pane dropdown lists Quick Presets **and**
  individual Layouts. *Recommended: yes* — what is live is "whatever InstaDesk last applied",
  Quick Preset or Layout. An exception here would be a rule with two readings, which §1 rejects.
  Resolved in **I-7**.
- **D-6 — Where the switch lives.** **Settled:** the Quick Presets block in the left pane, beside
  Apply, default off. Not Settings — the control belongs where its consequence happens.

---

## §8 — Amendment log

| Date | Change |
|---|---|
| 2026-08-24 | Plan opened at v1.0 after the operator settled the reading (R-4) and approved the general-switch recommendation. |
| 2026-08-24 | **I-1 added and promoted to the first code increment** — the Sandbox's existing `general_B.json` launches `Code.exe --new-window` and is reachable from its `QP_A`, so the fixtures on disk would have made the first teardown test close the session host. |
| 2026-08-24 | **§4A added** on the operator's ruling that validation happens in the *installed* Sandbox via the desktop icon. Establishes `--publish` + Check for updates as the operator-facing delivery path, because a plain build reports an unchanged `0.4.0` and is indistinguishable from the last one. Adds two operator checkpoints to §5. |
| 2026-08-24 | **I-1 widened, and the original was wrong.** It covered only the installed Sandbox's data dir. The two Sandbox flavours read **different** data dirs, and the dev dir carries **three** more `Code.exe` fixtures (`general_A`, `_E`, `_F`) with `general_A` reachable from its `QP_A`. Verifying one dir and generalising to "the Sandbox" is the narrowing failure this project has recorded before. Both dirs are now in scope, swept **separately**. |
| 2026-08-24 | **I-7 amended** — its dry run named the DEV panel, which does not exist in a packaged build. Moved explicitly to `--dev`, and I-7 marked as having no operator checkpoint. |
| 2026-08-24 | **§4A.1 / §4A.2 — `--publish` assessed and REJECTED; I-1b added.** The operator challenged the claim that the publishing robot handles Sandbox builds. **They were right** (`release.yml` triggers only on `v*.*.*`; the channel upload creates no ref), and verifying it exposed two further defects in my own recommendation: the repo is **PUBLIC**, so publishing exposes the build; and the self-update loop **could not have worked** — the installed Sandbox reports `0.4.0` and a published `0.4.0-sb.<ms>` sorts *below* it in semver, so it would never be offered. Replaced with local installer builds carrying a local version stamp (I-1b). **A challenge to a recommendation was worth more than the recommendation.** |
| 2026-08-24 | **I-0 widened** to repoint `SESSION_RESUMPTION.md` §8 in the same commit. Its "next front — not yet investigated" text became false the moment Phase 0 closed, and leaving it would send the next session to redo the investigation. Pointer only, never a copy. |
| 2026-08-24 | **I-1 fixture choice CORRECTED mid-increment — Notepad is unsafe on this machine.** The plan said "test on Notepad and Edge", inherited from the standing invariant. The dry run showed why that is wrong *here*: Win11's `C:\Windows\System32\notepad.exe` is a stub that hands off to the packaged Store Notepad, which opens documents as **tabs in an existing window** rather than new windows. The agent's snapshot-diff therefore finds no new window and falls through to *"any existing window"* (the fallback is only skipped when `--new-window` is passed, and Notepad has no such flag) — so a Notepad assignment can seize **a Notepad window the user already had open**. The operator currently has one open **with unsaved work** (`*Hybrid Engine - Updated Audit Runbook.txt`). Fixtures rewritten to use **Edge + File Explorer**, both of which reliably spawn their own windows. |
| 2026-08-24 | **F-8 confirmed live, and it is broader than recorded.** The investigation predicted the emitted `processId` would be useless *for browsers*. In I-1's dry run **all three** launches — including Notepad — reported a `processId` that was already dead seconds later. The launcher-exits-and-hands-off pattern is not browser-specific; Store-packaged apps do it too. The ownership record must be HWND-based, with no PID fallback anywhere. |
| 2026-08-24 | **I-1 rollback mechanism changed before acting** — a `pre-*` git tag would have protected nothing, since every file I-1 touches is gitignored or lives in `%APPDATA%`. Replaced with a SHA-256-verified file backup. §4 now warns to check the risk surface is actually in git before cutting a tag. |
| 2026-08-24 | **New constraint for I-6, found in I-1's dry run: an absence in a capture is not proof of absence.** `--capture-layout` reported no Explorer window on monitor 1 immediately after a successful launch; a later enumeration found two such windows had existed. The teardown must therefore establish "gone" by probing the handle (`IsWindow` + exe match), **never** by a window being missing from a window-list snapshot — the reassuring reading of a missing window is "closed", and it would be wrong. |
| 2026-08-25 | **I-1b done.** Two builds → two stamps; build #2 installed over #1 and the installed exe moved `0.4.0` → `0.4.0-sb.1787656373798`. ⚠ The leak-check written for this increment was itself defective first time: it matched the word `createUpdaterArtifacts` inside an explanatory **comment** and reported a leak. Fixed by making the check strip comments and follow code — not by rewording the comment, which is the reflex §3 forbids — and a control then proved the stripper had not simply blanked the file. |
| 2026-08-24 | **Parked finding (§0.3, not fixed here):** `ui/src/services/version.ts:8-10` claims `IS_SANDBOX` disables auto-update via `services/updater.ts`. It does not — `IS_SANDBOX` appears only in its own definition and `TopChrome.tsx:55`. The isolation is really the endpoint override in `tauri.sandbox.conf.json`. A comment asserting a safety property the code does not implement. |

---

*Consult before acting. Update in the same turn after. Nothing happens off-plan.*

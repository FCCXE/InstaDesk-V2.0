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
**`prebuild` now runs FIVE checks** — the fifth added by I-13.
This programme adds three instruments of its own:

| Gate | Where it runs | Guards |
|---|---|---|
| `check-tour-safety.mjs` **(extended, I-2)** | `npm run build` → `prebuild` | the new teardown verbs can never be fired from walkthrough code |
| Rust revalidation tests **(new, I-5)** | `cargo test --lib` | a recycled, mismatched or cross-session handle is refused before any close is posted |
| `check-updater-purity.mjs` **(new, I-13)** | `npm run build` → `prebuild` | a side effect sits inside a React state updater, which React may run more than once |

**⛔ Never weaken a gate to stop it complaining.** If one fires on a false positive, make it more
precise and re-bite it in both directions.

---

## §4 — Rollback policy

- **Programme rollback point: `v0.4.0`** (`b5120e1`), verified this session with `git tag -l`.
- Each **RISKY** increment cuts a local `pre-*` tag before its first edit. Planned:
  `pre-qp-switch-v1`, `-ownership`, `-switch-cmd`, `-ui` in the **app** repo; `pre-qp-switch-agent-hwnd` and `-agent-close` in the **WinAgent** repo, because that is where those increments’ risk surface lives.
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
| I-2 | **Extend tour-safety check** with the new verbs, before they exist | no | build | ✅ |
| I-3 | **HWND spike** (throwaway) — is the handle usable, and how does it die? | no | Sandbox `--dev` | ✅ |
| I-4 | WinAgent: emit `hwnd` in the launch result | **yes** | agent + Rust + Sandbox | ✅ `6e8f698` |
| I-5 | Rust: parse the agent result + **revalidation tests written first** | **yes** | cargo | ✅ `e9103b0` |
| I-6 | WinAgent: `--close-tracked` verify-then-report verb | **yes** | agent + Sandbox | ✅ `bd7c09e`* |
| I-7 | Rust: ownership record + the switch command | **yes** | cargo + Sandbox | ✅ `957da0e` |
| I-8 | `api.ts` + `AppState`: switch state and the new call | no | build | ✅ |
| I-9 | UI: the Switch mode control + anchor + EN strings | no | build + Sandbox | ✅ |
| — | **▶ OPERATOR CHECKPOINT 1** — stamped local installer → desktop icon | — | installed Sandbox | ✅ **PASSED 2026-08-25** — build `0.4.0-sb.1787666839355`, operator: *"working as expected"* |
| I-10 | UI: the outcome report — what could not be closed, and why | no | build + Sandbox | ✅ |
| — | **▶ OPERATOR CHECKPOINT 2** — the honest report, incl. the iVMS-4200 case | — | installed Sandbox | ☐ |
| I-11 | Tour: anchor registry, chapter step, content truth (F-7) | no | build | ✅ read on screen 08-26 |
| I-12 | ES parity sweep | no | build | ✅ |
| I-13 | Telemetry + **a fifth `prebuild` gate** (updater purity) | no | build | ✅ |
| — | **✅ CLOSED 2026-08-26** — real elevated-window detection, proven on iVMS-4200 | — | manual | ✅ `skippedElevated`, named, window untouched |
| I-15 | **Defect A** — editing a Layout must never destroy what the grid cannot show | **yes** | build + Sandbox | ✅ |
| I-16 | **Defect B** — make the save affordance reachable from where the editing happens | no | build + Sandbox | ✅ |
| I-17 | **Discoverability audit** — capability vs teaching | no | full | ✅ 11/30 gaps |
| I-18 | **A-0** — the stale command count in `check-tour-safety.mjs` | no | build | ✅ 10/33 |
| I-19 | **Silent merge** — the save now states the window count; merges are visible | no | build + Sandbox | ✅ |
| I-20 | **G-8/G-9** — launch args + two windows of one app, in the tour | no | build | ☐ |
| I-21 | **G-1** — multi-window apps, taught nowhere today | no | build | ☐ |
| I-22 | **G-2/G-3** — the two deletes | no | build | ☐ |
| I-23 | **G-11** — the Ctrl+Alt+1–9 hotkeys, in the tour | no | build | ☐ |
| I-24 | **G-4/G-5/G-6** — autostart, telemetry, licence | no | build | ☐ |
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

**Status. ✅ DONE 2026-08-25.**

- **Re-investigation:** the forbidden list was **re-read and re-counted from source**, not taken
  from the build's reported "18". It is 6 + 6 + 6 = **18** across the three axes, and the labelled
  counts in the file's own comments sum correctly.
- **Added while still imaginary:** `quickPresetsSwitch` (the api.ts method) and
  `quickpresets_switch` (the Rust command name, in case it is reached as a string literal).
  Total now **20**.
- **⚠ Scope addition, deliberate — the denylist had a hole this programme would have widened.**
  A denylist forbids only what somebody remembered to add. Ship a command under an unlisted name
  and the gate waves it through **while staying green** — the recorded *"verifications narrow to
  what they NAME"* failure. So the api surface is now closed **structurally**: tour code may not
  reach `api` at all, by member access or by import. This is exact rather than a guess, because it
  was measured first — tour code imports api **nowhere** and references **zero** `api.*` members,
  so it forbids nothing in use while covering every command that does not exist yet.
- **Regexes verified by behaviour, not by reading:** driven against eight cases, including the
  negatives that matter — `therapist.method()` and prose containing the word "api" do **not** fire.
- **Bite tests — 4 of 4 as required:**
  1. the new verb via `api.quickPresetsSwitch` → FAIL, **3** violations (import, denylist,
     structural), each naming file and line.
  2. **`api.monitors()` — a harmless command on NO denylist → FAIL.** This is the test that proves
     the hole is closed; under the old gate it would have passed silently.
  3. `quickpresets_switch` as a bare string literal → FAIL.
  4. **negative control** — a file whose prose contains "api", "therapist" and "rapid api design"
     → **PASS**, and that run reported **9** files scanned, proving the file was examined and
     cleared rather than skipped.
- **Proven to stop the real build, not merely to run inside it.** With a violation planted,
  `npm run build` exited **1** and `tsc`/`vite` **never executed** (0 occurrences in the log).
  Restored → green again, `built in 4.56s`, all four gates reporting.
- **Tree restored:** bite file removed; `git status` showed only
  `ui/scripts/check-tour-safety.mjs` modified.

⚠ **Tooling trap hit and recorded.** The first attempt wrote these regexes through a **Bash
heredoc**, which mangled the backslashes — the trap in handbook §10 that once turned `\b` into an
invisible `0x08` and left a gate matching nothing while reporting OK. Here it failed loudly instead,
but the remedy is the documented one: the regexes were written with the **editor tool**, then the
escapes were checked back out at **byte level** (0 control bytes) *and* exercised at runtime.
Reading a regex back is not sufficient evidence — a mangled one can look correct.


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

**Status. ✅ DONE 2026-08-25.** Throwaway; nothing from it ships. Instrumentation reverted and
the reverted state proven, not assumed.

**Re-investigation:** `Program.cs` still resolves the handle by snapshot-diff and still excludes
`preLaunchWindows`; the success JSON still emits `processId` and no handle.

**Method:** `Program.cs` was temporarily instrumented (uncommitted) to emit `spikeHwnd`,
`spikeFoundVia`, and the exe / owning-PID / title read back **from that handle**, plus a
`--spike-probe <hwnd>` verb that probes a handle exactly as a revalidation step would have to.
Agent rebuilt via `build-agent.mjs` before use. Edge and File Explorer only — **no `Code.exe`**,
and no Notepad (I-1).

### The six questions

**Q1 — is the resolved handle the right window? YES.**
Both a browser and a non-browser resolved to a handle whose exe and title read back as expected:
`msedge.exe` / "New tab - Profile 1 - Microsoft Edge", and `explorer.exe` for the Explorer window.

**Q2 — does it survive the launcher-exits-and-hands-off case? YES — and the PID story is worse
than F-8 recorded.** The reported PID differed from the window's real owner in **every single
launch**:

| launch | `processId` reported today | PID that actually owns the window |
|---|---|---|
| Edge #1 | 3468 | **7524** |
| Edge #2 | 11368 | **7524** |
| Explorer | 31748 | 43644 |

And the decisive row is the pair: **both Edge windows are owned by the same PID 7524** — the
pre-existing browser process, which also owns the user's own Edge windows. So the PID is not
merely *wrong*; even the **correct** PID is **not a window identity**. Closing by PID would take
both preset windows and the user's own browsing with them. **No PID may appear in the ownership
record, not even as a fallback or a tie-breaker.**

**Q3 — what does a handle look like after its window closes? It dies cleanly.**
After a graceful `WM_CLOSE` to one handle: `isWindow=false`, `visible=false`, `pid=0`, exe and
title empty. Detecting "gone" is therefore reliable **through the handle**, which is exactly what
I-1's finding demanded (an absence in a window-list snapshot is not proof of absence; a dead
handle is).
**And the sibling was untouched** — the other Edge window, owned by the *same process*, stayed
`isWindow=true` and visible. That is the direct proof that per-handle teardown does not cascade to
windows the user opened themselves.

**Q4 — does an exe check catch a handle that is not ours? Yes — but recycling was not observed.**
An `explorer.exe` handle checked against a recorded `msedge.exe` expectation was **rejected**.
⚠ **Handle recycling could not be forced on demand**, so this is evidence that the *mechanism*
discriminates, **not** evidence that recycling was reproduced. Do not read it as the stronger
claim. Revalidation therefore stays defence-in-depth exactly as invariant I-3 requires:
`IsWindow` **and** exe match **and** the session marker — no single one of them is sufficient.

**Q5 — multiWindowApp: how many handles? One per window — via a SECOND call site.**
`apply_multiwindow` loops `windows[]` and makes **one agent call per window** (`--title`), so N
windows yield N handles. But two things matter for I-5:
1. it keeps only `{ title, placed: bool }` and **discards the agent's output entirely**;
2. it does not go through `run_launch` at all — it uses **`run_agent_raw`**, a separate helper.

**So I-5 must thread the handle through BOTH call sites.** Wiring only `run_launch` would leave
every multi-window app's windows unowned — and therefore silently never torn down, with no error
anywhere. That is the "verifications narrow to what they NAME" shape again.

**Q6 — two launches of the same browser: distinct windows.**
Handles `4525636` and `2494974`, both `snapshot-diff-largest-stable`, both alive simultaneously.
The second launch gets **its own** window and does **not** relocate the first.
**This corrects the I-1 amendment**, which recorded the opposite as a possibility after only one
Edge window survived that run. The relocation hypothesis is **refuted**; something else closed
that window. The I-3 question this generated is answered and closed.

### Two findings about the INSTRUMENTS, both caught by controls

**S-1 — a byte search of the agent binary is blind, and its zeros mean nothing.**
Searching the built agent for `spike-probe` / `spikeHwnd` / `RunSpikeProbe` returned **0, 0, 0** —
which looks like proof the spike is gone. The control in the same query returned **0 for
`capture-layout` too**, a string that is certainly present. .NET packs managed strings into an
embedded (compressed) assembly, so the search sees none of them. **Every "the binary does not
contain X" claim about this agent is unfounded.** The spike's removal is proven **behaviourally**
instead: before the rebuild the agent answered `--spike-probe` with spike JSON; after it, the verb
is unrecognised and falls through (`"Either --program or --url must be provided."`).

**S-2 — the agent's `1.0.0+<commit>` stamp does NOT prove the source was clean.**
The rebuilt agent stamps `1.0.0+dd80f844…`, matching WinAgent HEAD exactly. But the **instrumented**
build carried the *same* stamp, because the stamp reflects **HEAD, not the working tree** — the
spike was never committed. Handbook §10 advises verifying that stamp before shipping an installer;
it is **necessary but not sufficient**, and a dirty tree is invisible to it. **I-14 must also check
`git status` on the WinAgent repo, not the stamp alone.** Flag for the handbook at programme close.

### Cleanup, verified

- Both spike windows closed gracefully by exact handle; `IsWindow` false for each afterwards.
- `Program.cs` reverted (`git checkout --`); **0** spike references remain in source; WinAgent repo
  shows only its two known untracked SVGs and `instadesk-tauri/`.
- Bundled agent **rebuilt from the reverted source** and confirmed by behaviour to have lost the
  spike verb; stamp matches HEAD and `Program.cs` reports clean against HEAD.


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

**Status. ✅ DONE 2026-08-25.** WinAgent commit **`6e8f698`** (pushed first, per invariant 2.2.6).

- **Rollback point corrected before acting.** The plan listed `pre-qp-switch-agent-hwnd` among the
  app-repo tags, but this increment's risk surface is entirely in the **WinAgent** repo. The tag
  was cut **there**, at `dd80f84`, verified with `git tag -l`, and confirmed **local only**
  (0 remote copies). Same lesson as I-1: check where the risk actually lives before cutting a tag.
- **Re-investigation:** the success payload still emitted `processId` and no handle.
- **Change is additive.** Diff is 14 insertions, 1 deletion — and the single deletion is the line
  that gained a trailing comma. `processId` is untouched and still emitted; other callers read
  this payload.
- **Dry run — the handle is the placed window, proven functionally rather than by coordinates.**
  Comparing the agent's `extendedFrame` against a `GetWindowRect` from PowerShell would have been
  meaningless: PowerShell reports **DPI-virtualised** coordinates while the agent is DPI-aware
  (the mismatch that misled I-1). So the test was behavioural instead:

  | step | result |
  |---|---|
  | launch Edge → monitor 3, grid `1,1,4,4` | `hwnd 2952640`, `processId 18408` |
  | probe the handle | `isWindow=true`, title "New tab … Microsoft Edge", owner `msedge` |
  | `WM_CLOSE` to **that handle only** | **12 windows → 11; exactly `('msedge.exe', 3, '1,1,4,4')` disappeared; nothing else changed, nothing appeared** |

- **Non-browser case:** File Explorer also returned a non-zero handle (`2560576`), closed cleanly
  by that handle afterwards. The desk was left as found.
- **Rust gate — the expected no-op:** `cargo test --lib` **8 passed, 0 failed**; `cargo build --lib`
  clean. Nothing in Rust parses the new field yet, which is exactly right for this increment: the
  agent may emit it before anything consumes it, but not the reverse.
- **Bundled agent rebuilt AFTER the commit** so its stamp matches the new HEAD:
  `1.0.0+6e8f6989…` == WinAgent `HEAD 6e8f6989…`.
- **S-2 applied, not just recorded.** The stamp was checked **and** so was the working tree —
  `Program.cs` reports 0 modifications against HEAD. I-3 proved the stamp alone cannot see a dirty
  tree, so from here the pair is the check, never the stamp by itself.
- **Both repos clean**, carrying only their known untracked entries.


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
2. **Amendment (2026-08-25), recorded before acting.** This step said "extract `hwnd` + `exe`" —
   **but the agent does not emit an exe.** I-4 added only `hwnd`. The obvious substitute is wrong:
   pairing the handle with the *Layout’s* `program` path would compare **the path we launched**
   against **the path the window reports**, which are two different quantities measured two
   different ways — and they genuinely differ (a Store-packaged app, or any launcher that hands
   off). Revalidation must compare like with like, so the record has to store what the **window**
   says. The agent therefore gains `hwndExe` in the same additive shape as I-4, and the parse
   extracts `hwnd` + `hwndExe`. Without this, I-5 as written could not be done.
3. Then implement the parse: pull the agent's JSON line out of `stdout`, extract `hwnd` + `hwndExe`,
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

**Status. ✅ DONE 2026-08-25.** Rollback tag `pre-qp-switch-ownership` cut in the app repo
(`1e31159`, verified with `git tag -l`, 0 remote copies). Agent side: WinAgent **`e9103b0`**,
pushed first.

- **Re-investigation** confirmed `run_launch` still returned `{exitCode, stdout, stderr, cmd}` with
  the agent JSON left inside `stdout` as text, and that `apply_preset` passed it through verbatim.
  It also exposed that the Steps were undoable as written — see the amendment above; the agent
  gained `hwndExe` so the record stores what the **window** reports.
- **Tests written first, and seen to fail first.** With the tests in place and no implementation,
  `cargo test --lib` refused to compile with **26 errors** naming exactly the missing types and
  functions. After implementing: **18 passed, 0 failed** (8 pre-existing + 10 new).
- **Bite tests — two mutations, each modelling a *plausible wrong implementation*, not a crash:**

  | mutation | tests that failed |
  |---|---|
  | unreadable exe treated as a match (the reassuring reading) | **only** `revalidate_refuses_when_the_exe_cannot_be_read` |
  | exe comparison dropped, `IsWindow` alone trusted | **only** `revalidate_refuses_a_recycled_handle_whose_exe_differs` |

  Each bit exactly one test, and the right one — a mutation that took down half the suite would
  have told us nothing about which test was load-bearing.
- **Both call sites wired, per the I-3 finding.** `run_launch` (call site 1) and
  `apply_multiwindow`, which goes through `run_agent_raw` and previously discarded the agent's
  stdout entirely (call site 2). Both are labelled in the source so the pairing is visible to the
  next reader. Wiring only the first would have left every multi-window app's windows unowned and
  silently never torn down.
- **Additive, verified:** `placedWindow` is inserted as a **key on each result object**, never as
  an element of the `results` array. The five consumers that read `results.length`
  (`LayoutsPane.tsx`, `MonitorSelector.tsx`) are therefore unaffected, and the UI gate passes
  untouched (595=595, 20 identifiers, 47/47 anchors).
- `cargo test --lib` **18 passed**, `cargo build --lib` clean, `npm run build` green.
- Agent rebuilt after the commit: stamp `1.0.0+e9103b08…` == WinAgent HEAD, **and** the WinAgent
  tree reports 0 modifications (the S-2 pairing, applied again).

⚠ **Self-inflicted incident, recorded because the lesson is general.** Restoring after the first
mutation, I used `git checkout -- src-tauri/src/backend.rs`. That restores the file to **HEAD** —
and this increment's work was uncommitted, so it destroyed the implementation and all ten tests,
not just the two mutated lines. The suite silently dropped back to 8 passing, which *looks* like
success if you are not reading the count. Caught by asserting the mutation was still present
before applying the next one.

**The rule this yields:** when mutation-testing uncommitted work, the restore point must be a
**copy of the file taken immediately before the mutation** — never version control, which knows
nothing about work that has not been committed. The rest of I-5 was redone with
`backend.rs.PRE_MUTATION` as the restore point, and the second mutation restored cleanly from it.
This is the recorded "restore what verification kills" rule, failing in a new way: the restore
mechanism was correct in form and far too broad in scope.


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

**Status. ✅ DONE 2026-08-25** — with **one verification left open**, named below. WinAgent
**`bd7c09e`**, pushed first. Tag `pre-qp-switch-agent-close` cut in the WinAgent repo at `e9103b0`
(0 remote copies).

**Re-investigation** confirmed `RunCloseAllWindows` still enumerates the desktop, still uses
`PostMessage`, and still returns `affected` as the number of messages **posted**.

**Design.** Input is a **JSON file**, not command-line arguments — executable paths carry spaces
and backslashes and a preset can hold many windows. Each record is classified into one of four
outcomes and carries `hwnd`, `exe`, `title` and a plain-language `reason`. **Every requested handle
appears in `windows` exactly once**, so the categories sum to `requested` *by construction* rather
than by a computed claim that could drift from the list beside it.

**Invariants verified structurally**, on the method body with comments stripped, and with controls
proving the check could still see the code (`PostMessage` and `IsWindow` both found):

| forbidden | result |
|---|---|
| `FindAllNonInstaDeskWindows`, `SnapshotWindowsForProcess`, `EnumWindows` (I-2) | clean |
| `TerminateProcess`, `.Kill(` (I-4) | clean |
| `SendMessage` (would let one modal prompt block the sweep) | clean |

### Bite tests

All run against windows opened for the purpose — never the operator's.

1. **Three categories in one call, and the sum checked.** Window A with its correct exe → `closed`,
   and the window really went. Window B with a **deliberately wrong** exe → `stillOpen`, *"this
   window is no longer the one InstaDesk opened"*, **and B survived** — confirmed by probing its
   handle afterwards. A bogus handle → `stale`. `counts` summed to `requested` = 3, and each handle
   was reported exactly once.
2. **A window that REFUSES to close** → `stillOpen`, reason *"the app did not close it — it may be
   waiting on a save prompt, or you declined one"*, naming the window by title. **The window and
   its process both survived.** The call returned in ~6 s (the bounded poll) rather than hanging.
   **This is exactly the case `--close-all` cannot see**: it would have counted `affected=1` and
   reported success.
   ⚠ Modelled with a **purpose-built form that cancels `FormClosing`**, deliberately **not**
   Notepad: on Win11 Notepad opens documents as tabs, and the operator has one holding unsaved
   work — closing that window would have prompted for *their* document. The substitution is the
   safer test, not a weaker one: it makes "the app declines" deterministic instead of dependent on
   a dialog nobody should be gambling with.
3. **Elevated → reported and NAMED, not omitted.** `skippedElevated`, with the reason *"runs as
   administrator, so Windows will not let InstaDesk close it"*, and the window survived.

### ⚠ Open verification — do not read this increment as fully proven

Test 3 forced the elevated branch with a **temporary hook**, because **no elevated window existed
on the machine and obtaining one requires a UAC prompt** (this session is not elevated). So what is
proven is the **classification, naming and reporting**; what is **not** proven is
`IsWindowElevated`'s real detection on a genuinely elevated window. That helper is pre-existing and
already relied upon by `--close-all`, but "already in production" is not evidence.

**Carried to the operator checkpoint after I-10**, where iVMS-4200 — which the codebase itself
names as the elevated case — can be running.

The hook was reverted **from a file backup, never from git** (I-5's rule) and the revert proven
**behaviourally**: the very same window that reported `skippedElevated` under the hook now reports
`closed`. A grep for the hook returning zero would not have been enough — `RunCloseTracked` itself
was also checked to be still present, confirming the restore returned the *intended* state rather
than HEAD.

### A second sighting of the I-1 phenomenon, and it nearly became a false alarm

The post-test capture showed **no** `notepad.exe`, and the operator's unsaved-work Notepad had been
in every earlier capture. Read naively that says a window with unsaved work disappeared during a
teardown increment. **It had not.** A direct enumeration found it fully intact — same PID 21228,
same handle `2295966`, still visible, still showing its `*` unsaved marker.

`--capture-layout` had simply omitted it, exactly as in I-1. **That is now twice**, and it is the
concrete justification for this increment's central design choice: the teardown decides "gone" by
probing the handle, never by a window's absence from a list. Had `--close-tracked` been built on a
window-list diff, it would have reported that Notepad closed.


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

**Status. ✅ DONE 2026-08-25.** Tag `pre-qp-switch-cmd` in the app repo at `e4d3075` (0 remote
copies). Agent side: WinAgent **`957da0e`**, pushed first.

- **Re-investigation ran, not trusted:** I-5's suite re-run (18 green) and I-6's verb exercised live
  on a fresh window before anything was built on top of it.
- **`quickpresets_switch(kind, slot, margin)`** — takes down what is live, applies the requested
  preset, records it. `kind` accepts `"quickpreset"` or a Layout kind, settling **D-5**. Re-applying
  the live preset is a refresh, settling **D-4**. Inherits `locked_guard()`.
- **The teardown cannot reach beyond the record.** It sends the agent a handle list and nothing
  else; there is no enumeration anywhere in the path (invariant I-2).

### Live end-to-end proof

Driven by `#[ignore]`d tests that open and close real windows —
`cargo test --lib -- --ignored --nocapture live_switch`. A test-only tokio runtime was added as a
**dev-dependency**; it is not linked into the shipped binary.

```
control window (never recorded): hwnd 1512322
switched to S -> 2 window(s) recorded live
teardown of S: {"closed":2,"skippedElevated":0,"stale":0,"stillOpen":0}
cross-check disagreements: []
T live with 1 window(s); control 1512322 was never recorded
```

The control window is the load-bearing part: opened **first**, deliberately never written into the
record, and still alive afterwards. Had the teardown reached past the ownership record it would
have died.

**D-3, both halves, proven live** (second `#[ignore]`d test):

- the session id is **stable across reads** (`1787587487` twice) — a drifting id would void a good
  record every time the app restarted;
- a record stamped with a **foreign** session id — what a reboot leaves on disk — produced
  `ran: false`, *"the record was from a previous Windows session, so it was discarded untouched"*,
  and the real live window named in that record **survived**, proven by closing it successfully
  afterwards. The test uses a genuine window precisely so the gate is tested against something that
  could actually be destroyed.

### Cross-check: two implementations that must agree

`--close-tracked` now returns the raw probe (`probedIsWindow`, `probedExe`) beside each outcome, so
Rust recomputes the verdict via `revalidate_owned_window` and compares. Zero disagreements in the
live run. This also stops I-5's tested function from being test-only — a check nobody has seen run.

### Tests: 26 green + 2 live, with a mutation

`collect_placed_windows` walks the response recursively rather than following a hand-written path,
because the two apply paths nest their results differently. **Mutation** — a collector following
`results`/`layouts` and forgetting `windows`, exactly the plausible mistake — failed
`collects_placed_windows_from_both_response_shapes` and nothing else. Restored from a file backup,
never git (I-5's rule); 26 green again.

### ⚠ Trap found the hard way: `cargo test` runs a MONTH-STALE agent

The first live run failed on "control window should have been placed" and looked like a defect in
the switch. It was not. `init_paths()` never runs under `cargo test`, so `agent_path()` fell through
to the dev-tree agent at `winagent/.../publish/sidecar/`, stamped **`1.0.0+b250b31`** — from
2026‑07‑27, before v0.3.0. That build emits no `hwnd` at all, so nothing could be recorded.

This is the *other face* of the recorded dev-Sandbox trap: the memory spoke says `--dev` uses the
**bundled** agent and not the sidecar. True there — but under `cargo test` the sidecar **is** what
gets used, and it is stale. **Any Rust test touching the agent must pin `AGENT_PATH`**, which this
test now does, asserting the bundled exe exists first. Without the pin a test could also *pass*
against month-old behaviour, which is the worse failure.

### Third sighting of the capture-omission phenomenon

`--capture-layout` reported **2** Explorer windows while a direct enumeration found **6**, including
the operator's own. Three sightings now. It reinforces the same rule: probe handles, never trust a
window list — and it is why cleanup here was done by enumeration and exact title match rather than
from a capture.


---

### I-8 — `api.ts` + `AppState`: switch state and the new call ☐

**Objective.** Wire the tier the UI will use. The switch is session state that must survive a tab
change, so it lives in `AppState`, not in a pane (standing rule; `MonitorSelector`'s `selected` is
component-local and is cleared when its entry disappears).
**Steps.** Types for the switch result; the client method; the persisted preference in `AppState`
alongside `windowMargin` / `gridSizeByMonitor`, wrapped in try/catch like its neighbours.
**Done when.** `npm run build` green with the new types unused by any component yet.
**Verification.** Build output including all four `prebuild` gates.

**Status. ✅ DONE 2026-08-25.**

- **`api.ts`:** `quickPresetsSwitch(kind, slot, marginPx)` plus the response types. The outcome
  vocabulary is typed as a union (`closed | stillOpen | skippedElevated | stale`) rather than a
  bare string, so I-10 cannot silently forget a case the agent can produce — and `counts` is keyed
  by that same union, so the two cannot drift apart.
- **`AppState`:** `switchMode` persisted at `instadesk:switchMode`, mirroring `windowMargin`'s
  load/save/try-catch shape. **Default off**, and only the exact string `'true'` turns it on —
  absent, corrupt or half-written all fall to off, the safe direction for a mode that closes
  windows.
- It lives in `AppState`, not in the pane that will show it: component-local state is destroyed
  when a tab change unmounts the pane, and the switch would appear to turn itself off. Threaded
  through the context type, the provider, the value object **and the memo dependency list** —
  omitting the last would have frozen the value every consumer reads.
- **Nothing consumes it yet**, which is the point of this increment: the tier exists before the
  control that uses it.
- **The gate did its job.** The first build failed — `error TS2552: Cannot find name
  'PresetRunResponse'`. I had invented a type name for the single-Layout response; `presets_run`
  is typed inline, with no such alias. Fixed by using the real shape rather than by inventing the
  alias to match, which would have been a second unverified name. `npm run build` then green with
  all four `prebuild` gates reporting.


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

**Status. ✅ DONE 2026-08-25** — awaiting **OPERATOR CHECKPOINT 1**.

- **The control** sits directly under Apply, in the Quick Presets block: that is the button whose
  behaviour it changes, and putting a destructive mode in Settings would hide it away from its own
  consequence. Default off. The sub-label **states which way round it is** ("On — applying closes
  the live preset first" / "Off — applying adds to what is already open"), so the state is never
  inferred from a colour alone.
- **`data-tour="qp-switch-mode"` and its `anchors.json` entry landed in the SAME commit** — the
  anchor gate bites in both directions, so either half alone fails the build. 47 → **48** anchors,
  registry and source agreeing.
- **The switch-off path is byte-for-byte v0.4.0, and that was verified rather than asserted.** The
  diff of `MonitorSelector.tsx` removes exactly **one** line — the `useAppState` destructuring,
  replaced by a superset. Everything else is additive behind two `if (switchMode)` guards, so with
  the switch off both fall straight through to the original code.
- **The hotkey honours it too.** `Ctrl+Alt+1..9` routes through the same guard. Switch mode governs
  the *transition*, so it must govern every way of triggering one; had the button swapped while the
  hotkey still stacked, one setting would mean two things depending on how you reached it — exactly
  the ambiguity §1 rejected when choosing a general switch over a per-preset flag.
- **EN and ES added together**, not EN-then-translate. The parity gate runs on *every* build, so an
  EN-only step would either fail the gate or need ES placeholders carrying English text — and a
  placeholder that satisfies a gate is invisible to it afterwards. 595 → **602 = 602**.
  **I-12 therefore becomes a verification sweep rather than a translation batch.**
- All four `prebuild` gates green; `built in 4.73s`.

**Owed to the operator at the checkpoint:** confirm the control reads correctly in both states, and
that Apply with the switch **off** behaves exactly as before.


---

### I-10 — UI: the outcome report ☐

**Objective.** Deliver operator ruling D-1: the app says **which** window it could not close and
**why**.
**Steps.** Extend the status line / flash surface to report the transition honestly — closed
count, plus each `stillOpen` and `skippedElevated` window **named with its reason** ("runs as
administrator", "save prompt not answered"). Never report a count of requests as an outcome.
**Done when.** A swap that leaves a window behind says so, on screen, naming it.
**Verification.** Sandbox run with a window that DECLINES to close, and — if one is available — an
elevated window; transcript or screenshot of the actual message.
⚠ **Amended 2026-08-25:** this step said "a Notepad holding unsaved text". I-1 banned Notepad from
this programme: Win11 opens documents as **tabs**, and the operator keeps one holding unsaved work, so
the test could prompt for *their* document. The stubborn-window harness from I-6 models the same case
deterministically and without touching anything real.

**Status. ✅ DONE 2026-08-26** — awaiting **OPERATOR CHECKPOINT 2**.

- **The report names windows; it does not merely count them.** After a swap, every window that came
  back `stillOpen` or `skippedElevated` is listed with its **title and the agent's own reason**.
  `stale` is omitted (it was already gone) and `closed` speaks for itself.
- **The wording comes from the agent**, which is the only layer that knows why. Composing our own
  phrasing in the UI would let the two drift, and the user would be told something the mechanism
  never concluded.
- **It persists until dismissed**, unlike the status line, which clears after 2.8 s. "It worked" can
  afford to vanish; "something of yours is still open" cannot.
- **Cross-check disagreements surface as a defect notice**, not as a user-facing outcome. If our
  reading and the agent's ever disagree, the panel says so and asks the user to report it.
- **Live proof** (`live_switch_reports_a_window_it_could_not_close`):
  ```
  counts: {"closed":0,"skippedElevated":0,"stale":0,"stillOpen":1}
  LEFT OPEN  title="INSTADESK-BITE-TEST-STUBBORN"
             reason="the app did not close it — it may be waiting on a save prompt, or you declined one"
  ```
  The test asserts the title and reason are both non-empty — a report that named nothing would pass a
  weaker assertion while telling the user nothing.

**⚠ Not a tour anchor, deliberately.** The panel first carried `data-tour="qp-left-behind"`, and the
anchor gate **rejected the `reachableWhen` kind I invented for it**. That refusal was right, and it
pointed at the real answer: this panel exists *only* after a switch has left something open, so a
walkthrough could never reach it on a healthy desktop. A step pointing here would find null and be
unable to tell "not rendered yet" from "deleted" — finding F-4 exactly. The attribute was removed
rather than the gate widened, and the reasoning kept in the source.

**Owed at the checkpoint:** see the panel on screen, and — with **iVMS-4200 running** — close I-6's
open verification by confirming a genuinely elevated window is reported and named.


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

**Status. ✅ DONE 2026-08-26** — one half owed to the operator, named below.

- **F-7 was real, and it had already happened.** The Apply step read *"Apply launches everything in
  the bundle and places each window on the screen it belongs to."* With Switch mode shipped that
  sentence is **incomplete, not wrong** — the most dangerous kind, because every gate stays green
  while it quietly stops telling the whole truth. It now ends: *"On its own it only ever ADDS to
  what is already open."*
- **New step** on `qp-switch-mode`, in EN and ES: what the switch does, that unsaved work is asked
  and never forced, and that whatever stays open is listed by name. 45 → **46** step references.
- **Deliberately NO schematic**, and this is a judgement worth recording rather than a gap. The
  engine animates a two-state A → B toggle (`startTransform` / `endTransform`). A swap is inherently
  **three**-state: old in place, old gone, new in place. Squeezing it into two would draw something
  that is not what the action does — and a misleading diagram of the **most destructive action in
  the app** is worse than no diagram. REQ-2's purpose is that the tour must never *perform* such an
  action; that is enforced by the safety gate, not by the picture. A faithful switch schematic
  needs a three-phase engine, which is a legitimate future item and not this increment's job.
- **The safety gate re-bitten in the new state**, since the chapter now references the anchor: a
  tour file calling `api.quickPresetsSwitch` was refused with **2** violations — the denylist entry
  added in I-2 *and* the structural api rule — then removed and the gate returned to green.
- All four `prebuild` gates green; `built in 4.28s`; 610 = 610 keys.

**⚠ Owed: a human must READ the chapter on screen.** Gates verify structure; **nothing verifies that
prose is true** — v0.4.0 shipped a walkthrough describing grid sizes the app does not offer, past
three green gates, and a person reading the screen caught it. Folded into the release checkpoint.


---

### I-12 — ES parity sweep ☐

**Objective.** EN/ES parity, enforced by the gate.
**Re-investigation.** Re-derive the leaf-key counts at the moment of the sweep. Do not quote the
595/595 recorded in §2.2.
**Done when.** `check-i18n-parity` reports identical sets.
**Verification.** The parity line from a real build.

**Status. ✅ DONE 2026-08-26.** A verification sweep, per the 2026-08-25 amendment — the translation
itself was done alongside each English string, because the parity gate runs on every build.

- **Counts re-derived at the moment of the sweep:** **610 = 610**, key sets identical. (§2.2's
  595/595 is now stale, which is exactly why it says to re-derive rather than quote.)
- **All 19 keys this programme added or revised are genuinely translated** — checked by asserting
  the Spanish value is not byte-identical to the English. Parity alone cannot see this: a key
  present in both files with the English text copied across satisfies the gate perfectly.
- **Whole-file sweep for the same failure**, not just this programme's keys: of 610 pairs, exactly
  **one** sentence-length value is identical in both locales — `help.version`
  (*"InstaDesk v{{version}} — FCLX Studios"*), a product name and version number, correctly the
  same in both. No untranslated strings anywhere in the file.
- **✅ Read on screen by the operator, 2026-08-26, in build `0.4.0-sb.1787773148698`:**
  *"Looks good in english and spanish."* This also closes I-11's owed half — gates verify
  structure, and only a person reading the screen verifies that prose is true.

**Judgement recorded — the Express Tour's Apply step was left alone.** The sweep surfaced a *second*
`qp-apply-button` step, in the `quickStart` chapter: *"Press Apply and every app in the Layout opens
and lands in its saved region…"*. Unlike the Quick Presets chapter's version, this one is **not**
made incomplete by Switch mode — it describes what Apply does and never claims nothing else happens,
so it stays true in both modes. It is also the ninety-second introduction for a first-time user, for
whom the switch is off and unseen. The contrast belongs where the switch step now sits immediately
after it. Recorded rather than silently skipped, because F-7's whole lesson is that incomplete prose
is invisible to every gate.


---

### I-13 — Telemetry ☐

**Objective.** Learn whether the switch is used and whether teardowns leave windows behind.
**Steps.** Mirror the existing `quickpreset_applied` shape. Emit the transition outcome including
counts of `stillOpen` and `skippedElevated`. **React state updaters must stay pure** — the
recorded `StrictMode` double-emit defect came from a side effect inside a setter.
**Done when.** Events fire once per transition under `StrictMode`.
**Verification.** Observed event log showing exactly one event per swap.

**Status. ✅ DONE 2026-08-26.**

- **Each outcome is reported SEPARATELY**, not summed. I-9 emitted a single `leftOpen` total — the
  very collapsing of two meanings into one value this programme keeps running into. *"The app
  declined"* and *"Windows forbade it"* have different remedies and a combined count cannot tell
  them apart. `quickpreset_switched` now carries `closed`, `stillOpen`, `skippedElevated`, `stale`,
  plus `requested` so a **rate** can be computed rather than a bare count that means nothing without
  its denominator — and `teardownRan`, `placed`, `kind`, `source`.
- **`disagreements` is emitted and must always be 0.** A cross-check failure would otherwise reach
  us only if a user happened to report the on-screen notice.
- Telemetry stays **inert unless keys are present at build time**, so this adds nothing to a dev run
  or a key-less build, and the existing opt-out governs it like every other event.

### A fifth gate, added deliberately: `check-updater-purity.mjs`

The step said *"React state updaters must stay pure — the recorded StrictMode double-emit defect
came from a side effect inside a setter."* That was a **sentence**. This programme adds a second
emit, on a destructive action, so the defect class is live again — and rule 4 says a check is
written and proven to bite, not asserted. It is now a mechanism.

It scans the **updater form only** (`setX(prev => …)`); `setX(value)` is not an updater, and effects
in event handlers or `useEffect` are legitimate and untouched. Argument text is captured by paren
balancing with string-skipping, so a nested call or a bracket inside a message cannot truncate it.

**Bite tests — 3 of 3:**
1. the **v0.4.0 defect verbatim in shape** (`track()` inside `setIndex`) → FAIL, naming file, line,
   setter and reason.
2. `localStorage` inside an updater → FAIL.
3. **negative control** — effect in the handler, pure updater → **PASS**, and that run reported
   **57** updaters across **51** files, proving the file was scanned and cleared, not skipped.

**Proven to stop the build, not merely run inside it:** with a violation planted, `npm run build`
exited **1** and `tsc`/`vite` never executed. Restored → green.

**The existing tree passes on its merits:** **56** functional updaters across 50 files, all clean —
including this programme's three `track()` calls, which sit in async handler bodies that StrictMode
does not double-invoke. A gate with nothing to look at would be worthless, and this one says so
loudly if that ever becomes true.


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

### I-15 — Defect A: editing must not destroy what the grid cannot show ☐ **RISKY** → tag `pre-layout-preserve`

**Objective.** Stop silent data loss. Operator-reported, pre-existing in v0.4.0, and capable of
deleting a user's saved work.

**Mechanism, already measured (2026-08-26).** `parsePresetIntoCells` (`layoutBuilder.ts:336`) skips
any assignment with no top-level `title`; a `multiWindowApp` has none, because its titles live
inside `windows[]`. And `buildSaveAssignmentsMulti` (`:269`) builds **purely from grid cells** — it
never sees the original preset. So Edit drops the entry and Save writes it out of existence.

**Design — PRESERVE, do not represent.** Three options were weighed:
(a) **preserve** unrepresentable assignments through load → save, untouched;
(b) **represent** multi-window apps as grid cells so they can be edited;
(c) **warn only**, and let the loss happen if the user proceeds.

**(a) is the fix.** (b) is a feature, not a repair — it needs a design for how a one-launch,
many-window app occupies cells across monitors, and shipping that in reaction to a data-loss report
is how one defect becomes two. (c) leaves the destruction intact and merely narrates it. (a) makes
the edit **non-destructive**, which is the actual defect, and does not foreclose (b) later.

**Steps.**
1. On Edit, capture the assignments the parser could not represent, into `AppState` beside
   `editingLayoutId` — the same place, for the same reason: a tab change unmounts the pane.
2. On the edit-overwrite save, append them to the built assignments.
3. **Only** on that path. Saving to a *different* slot must not carry another Layout's hidden
   entries into it.
4. Tell the user on the editing banner: N entries are preserved and not editable here.

**Bite test (mandatory).** Load a Layout containing a `multiWindowApp`, save it unchanged, and
assert the assignment is **byte-identical** afterwards — against the real Sandbox `general_A`
(the Observatory launcher), not a hand-typed fixture. Then mutate the preserve step off and prove
the assignment is destroyed, which is what v0.4.0 does today.
**Done when.** A round-trip edit+save of a multi-window Layout loses nothing.

**Status. ✅ CODE DONE 2026-08-26** — one end-to-end verification owed (below).

⚠ **SEVERITY CORRECTED. I overstated this to the operator and must own it.** I said saving after an
edit *destroys* the hidden entry. Reading `onSaveEditedLayout`'s guards shows that is true in only
one of two cases:

| Layout contains | What v0.4.0 actually does |
|---|---|
| **only** unrepresentable entries (e.g. the Sandbox's `general_A`) | loads EMPTY, and the save is **refused** — `assignedCount === 0` returns early. Frustrating; **no data lost**. **This is the operator's case.** |
| a **mix** of representable and unrepresentable entries | loads partially, the save **succeeds**, and the hidden entry is **silently destroyed**. **This is the data-loss case.** |

Both symptoms the operator reported are real — the empty display and the un-saveable Layout — but
the destruction needs a *mixed* Layout, which they do not currently have. The defect is real and
worth fixing; it was not, in their case, eating their work. Saying so plainly matters more than the
drama of the first telling.

**Implemented.**
- On Edit, assignments with no top-level `title` are captured into `AppState` beside
  `editingLayoutId` — same place, same reason: the pane unmounts on a tab change.
- On the **edit-overwrite path only**, they are appended back. Saving to a different slot cannot
  carry one Layout's hidden entries into another.
- Cleared at all **3** exit-edit sites, so they cannot leak into the next edit.
- The editing banner now **says** how many entries are hidden and that they are kept — silence is
  what made this a defect rather than a limitation, because the user could not know.

**Verified so far.**
- The Rust save path preserves them: `presets_save` only fills in `type` when **absent**, and a
  `multiWindowApp` already has one, so every field passes through verbatim.
- Against the **real** Sandbox `general_A`, the fix's own predicate selects exactly the
  `multiWindowApp` entry (1 of 1, 7 windows), and the categories sum.
- All five `prebuild` gates green.

**⚠ Owed: the end-to-end round trip.** There is **no TS test harness in this project** (no vitest,
no jest — checked), so this cannot be a unit test without adding a runner on the eve of a release.
The decisive proof is a real Edit → Save in the Sandbox with the file compared **byte for byte**
before and after. Operator triggers; I measure.

**Status. ✅ DONE 2026-08-26 — PROVEN END TO END on real data.**

The operator edited the Sandbox's `USDJ Jubilee Observatory` Layout and saved. Measured against the
byte-exact baseline taken beforehand:

| | before | after |
|---|---|---|
| `general_A.json` | 1631 bytes, sha `a0d3aa93055e` | 2117 bytes, sha `4aada6d019d0` |
| assignments | 1 | **3** |
| hidden multi-window entries | 1 | **1** |
| the Observatory entry, 7 windows | — | **SURVIVED BYTE-IDENTICAL** |

Two new entries were added **and** the multi-window launcher came through untouched, field for field.
Under v0.4.0 that save would have written only the two new entries and destroyed the Observatory
one. The on-screen notice — *"1 entry in this Layout can't be shown in the grid…"* — was confirmed
present in the screenshot before the save.

⚠ **A first attempt did NOT test this**, and saying so matters. The operator reported "works fine"
after editing Layout **B** — which has **zero** hidden entries, so the preserve path never ran. The
file comparison caught it: `general_A` was byte-identical, untouched. A verification that narrows to
what it names, exactly as recorded. The real test followed.

---

### I-16 — Defect B: the save affordance is on a different tab from the editing ☐

**Objective.** Make it findable. Nothing is broken — `editingLayoutId` lives in `AppState` and
survives the tab change, and the amber *"Save changes to Layout X"* banner does overwrite in one
click. But `RightPane.tsx:83` mounts `LayoutsPane` **only** on the Layouts tab, while changing a
monitor's configuration happens in the grid and the Apps tab. The user must navigate back to find
the save, and therefore concludes there is none.

**Design.** Surface the editing state in the **bottom bar**, which is always mounted and already
reads `editingLayoutId`. It names the Layout being edited and offers a control that takes the user
to the save.
⚠ **The save itself stays in `LayoutsPane`.** Firing it from the bottom bar would mean invoking
logic in a component that is unmounted — an event nobody is listening to. Navigating to where the
control already lives is the honest fix and the small one.

**Done when.** While editing, the bottom bar says so from any tab, and one click reaches the save.

**Status. ✅ DONE 2026-08-26 — confirmed on screen.** The operator's screenshot shows the strip while
they were on the **Apps** tab: *"Editing Layout A — Changes are not saved until you press Save
changes on the Layouts tab"*, with **Go to save →**. They then found the save and completed the
round trip, which is the whole point: the affordance was never broken, only unreachable from where
the work happens.

---

### I-17 — Deep audit before release ☐

**Objective.** Operator-requested: a deliberate sweep of the app before v0.5.0 ships, rather than
trusting that five green gates mean the product is sound. **Mechanical green is not soundness** —
the gates compare the app to its own rules; nothing compares the app to what a user expects.

**Scope to settle with the operator before starting**, since "deep audit" admits several readings:
the Layout/Quick Preset data paths, the whole UI surface for more affordance gaps of B's kind, the
agent's verbs, or the release artefacts. Defects A and B were both found by a **person using the
app**, not by any gate — which is itself evidence about where to look.

**Status. ✅ DONE 2026-08-26.** Record: `docs/workplans/DISCOVERABILITY_AUDIT_v1_0.md`.

**Scope, set by the operator's own observation** (*"these are the types of features our Guided Tour
doesn't cover"*): audit **capability versus discoverability** — what the app can do, against what it
tells you it can do. Chosen over the data paths, the agent verbs or the release artefacts because
**every** defect this sweep produced had that one shape, and **not one was findable by a gate**:
the save on the wrong tab, the Quick Preset delete inside a modal, launch args taught nowhere.
Gates compare the app to its own rules; nothing compared its capabilities to its teaching.

**Result: 11 of 30 user-facing capabilities are absent from the Guided Tour; 7 of those are absent
from Help as well — taught nowhere in the product.** The `apps` chapter is the thinnest of the nine
and stops exactly one step short of launch args, the feature that unlocks two windows of one app.

**The audit independently rediscovered the Quick Preset delete** — the gap the operator had hit by
hand an hour earlier. That is the best evidence available that it measures the right thing.

**⚠ And it caught this programme's own work.** The I-11 tour step for Switch mode pointed at the
control and explained the behaviour but **never used the words "Switch mode"**, and there was **no
Help entry at all** — the very defect the audit exists to find, committed by the increment meant to
prevent it. Fixed on the spot, since it is in scope: the step is now titled *"Switch mode — one
preset at a time"*, and the Quick Presets Help section went from 2 bullets to 4, naming Switch
mode, the delete, and the Ctrl+Alt+1–9 hotkeys.

**Left open, ranked, for the next programme:** launch args in the `apps` chapter (highest value per
word); multi-window apps; the two deletes; the hotkeys in the tour; autostart / telemetry / licence.

**⚠ Method caveat, stated in the audit itself:** the cross-reference is a keyword match. It answers
*"is this ever mentioned?"*, not *"is it explained well?"* A `yes` means **no gap proven**, never
**adequately taught**.

**A-0 (new, not fixed):** `check-tour-safety.mjs`'s header still reasons *"9 of 32 commands reach
the agent … 9+23=32"*. The surface is now **33** — 32 under `backend::`/`license::` plus
`set_hotkey` — because this programme added `quickpresets_switch`. The gate's behaviour is
unaffected (it matches identifiers, not counts), but a comment stating a total that no longer holds
is exactly the stale fact someone trusts later.

---

### ⚡ SEQUENCE CHANGED 2026-08-26 — finish, then launch

The plan had the release next. The operator asked *"why the haste to launch an unfinished
product?"* and was right. **My case for shipping first was "get the data-loss fix to users" — and I
had never checked whether there are any.**

Measured: **one download per release** on v0.2.1, v0.3.0 and v0.4.0 — the operator's own machine.
The `latest.json` counts (60 / 109 / 12) are that one installation's updater polling. **There are no
users.** Shipping now would protect nobody, and nothing is time-pressured.

A recommendation from a general principle, without checking that its premise held. The measurement
cost one command. **I-14 moves after the fixes below.**

---

### I-18 — A-0: the stale command count in the safety gate ☐

**Objective.** `check-tour-safety.mjs`'s header reasons *"9 of 32 commands reach the agent, 23 do
not, 9+23=32"*. Correct for v0.4.0; the surface is now **33**. The gate matches identifiers, not
counts, so behaviour is unaffected — but a comment stating a total that no longer holds is the
stale fact someone trusts later.
**Steps.** Re-derive the surface **and the reach set** from source; do not adjust the numbers by
arithmetic. Prove the categories still sum.

**Status. ✅ DONE 2026-08-26. Result: 10 of 33 reach the agent, 23 do not, 10+23=33.**

The old comment was **right for v0.4.0** (9 of 32, 23 do not). The delta is exactly
`quickpresets_switch`, and **"23 do not" is unchanged** — which is the check on the arithmetic.

⚠ **Getting this right took four derivations, and three were confidently wrong. Every error was
caught by a control, never by inspection.** That is the finding; the number is almost incidental.

| attempt | said | wrong because |
|---|---|---|
| 1 | 11 reach | fn bodies extracted by guessing where the next `fn` starts — bodies bled together and credited `list_browsers` and `open_manual` |
| 2 | 9 reach | brace matching fixed the false positives, but the seed set was a **guessed list of helper names**; it lost `identify_monitors`, which spawns via `spawn_agent_detached` → `spawn_agent_child` |
| 3 | 11 reach | seeded on "touches `agent_path()`" — too broad: `health` looks the path up **to report it** and never spawns |
| 4 | **10 reach** | seeded on the two real spawn constructions — `agent_command(..)`, and `agent_invocation(..)` + `Command::new` — with **9 controls in both directions**, all passing |

**The method that worked, now written into the gate's own header** so the next person does not
repeat it: *reaching* means **spawning**, not path lookup; there are **two** spawn constructions,
not one; extract bodies by **brace matching**; and run controls in **both** directions, requiring
every one to pass.

The gate's behaviour is untouched — a comment was edited — and it was re-bitten to prove it:
a tour file calling the switch still fails with 2 violations, then green on removal.

---

### I-19 — The silent merge ☐

**Objective.** Two regions of one app with the same args collapse into a single window **with no
warning**. Non-adjacent regions error (*"isn't a single rectangle"*); adjacent ones merge silently
— the user gets one full-width window they did not ask for and is told nothing. This is what cost
the operator the two-VS-Code-sessions discovery.

**⛔ Do NOT change the grouping.** `regionGroupKey(app, args)` is deliberate, and altering it would
silently change the meaning of **every Layout already saved**. The fix is to **warn**, and to point
at the launch-args override that already solves it.
**Done when.** Saving a Layout where one (app, args) group spans what were plainly separate
selections produces a visible warning naming the app and the remedy.

**Status. ✅ DONE 2026-08-26 — but NOT as the Done-when was written, and that is the finding.**

⚠ **The Done-when asked for something undetectable.** "Spans what were plainly separate
selections" is a statement about the user's **intent**, and by the time `buildSaveAssignments` runs,
that history is gone — all it has is a `cell → app` map. Two regions drawn separately and one
region drawn in a single sweep are **byte-identical** in the data. Any warning keyed on "these were
separate" would have been a guess dressed as a detection, and it would have fired on people who
meant exactly what they drew.

**So the fix reports rather than detects** — the same move as the teardown report:

1. **The save summary now states the window count**, and tallies repeats as `App ×2`:
   *"Saved … • 3 windows • M1: VS Code, File Explorer • M3: Edge"*. A user who drew two VS Code
   regions and got one window now **sees** `VS Code` once instead of `×2`. The merge stops being
   silent without anyone having to infer intent.
2. **The not-a-rectangle error now names the remedy.** It previously said what was wrong and left
   the user to discover on their own that two regions of one app need **different launch args** to
   become two windows — the very thing they were trying to do. It now says so.

**Grouping deliberately unchanged**, per the increment's own prohibition: `regionGroupKey(app, args)`
decides the meaning of every Layout already saved.

Both save paths were updated — the assertion required **2** matches and would have failed on 1, which
is how the "+ New Layout" path avoided being left behind. All five gates green; 617 = 617 keys.

---

### ⚖ Sub-menus for the Guided Tour — ASSESSED AND REJECTED (operator question, 2026-08-26)

**Measured first.** Every one of the audit's eleven gaps belongs in a chapter that **already
exists**. Projected: **46 → 55 steps, and 9 → 9 chapters.** The chapter list does not grow; the
chapters get deeper. Only `monitorsSettings` becomes uncomfortable, at 7 → **10** steps — and
nesting would not help that at all.

Sub-menus solve *"too many top-level items"*, which is a problem this tour does not have.

**And the stronger objection.** This app's diagnosed failure mode is **things sitting one layer
deeper than people look** — the save on another tab, the Quick Preset delete inside a modal, launch
args behind a control nothing mentions. Three for three, all found by a person, none by a gate. The
Guided Tour is the one surface whose whole job is to cure that. **A sub-menu is by construction a
place to hide things**; adding one here would apply the disease as the treatment.

**Instead, folded into I-20…I-24** — organisation designed with the content, not bolted on after:
1. **Group headers in the flat list** — Essentials · Building layouts · Power features · Settings.
   Everything stays one click away; the menu already scrolls, so length is not the constraint.
2. **Split `monitorsSettings`** into *Monitors* and *Settings* rather than nesting it — 10 chapters,
   still a comfortable flat list, and it puts autostart / telemetry / licence where they are looked
   for.
3. **Tag the advanced chapters**, so a first-timer is not intimidated and a returning user can find
   depth deliberately.

**Revisit only if the chapter count ever passes ~15.** It will not from this work.

---

### I-20…I-24 — the audit's open gaps ☐

Ranked in `DISCOVERABILITY_AUDIT_v1_0.md` §4 by *cost of not knowing*: launch args first (highest
value per word, and the operator hit it), then multi-window apps, the two deletes, the hotkeys,
then the Settings surface.

**⚠ The audit's own caveat binds this work:** its cross-reference is a **keyword match**. Adding a
passing mention would flip a row to `yes` while teaching nobody anything. The bar is *explained*,
not *mentioned*.

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
| 2026-08-25 | **I-2 widened beyond its stated Steps, deliberately.** The plan only asked to add the new verbs to the denylist. But a denylist forbids only what someone remembered to list, and this programme adds commands — so the gate now also closes the api surface **structurally**: tour code may not reach `api` at all. Measured before writing it (tour code touches zero `api.*` members), so it forbids nothing in use. The bite test that matters is `api.monitors()` — harmless, on no denylist, and now caught. |
| 2026-08-25 | **Handbook §10 heredoc trap hit.** The regexes were first written through a Bash heredoc, which mangled the backslashes. Rewritten with the editor tool, then the escapes verified at byte level (0 control bytes) **and** exercised at runtime — reading a regex back is not evidence, since a mangled one looks correct. |
| 2026-08-25 | **I-3 REFUTES the relocation hypothesis this plan recorded on 2026-08-24.** Two Edge launches produced two **distinct** live handles; the second does not relocate the first. The I-1 observation that prompted it had another cause. Question 6 is answered and closed. |
| 2026-08-25 | **F-8 hardens further: PID is not a window identity at all.** Both Edge windows are owned by the SAME PID (7524) — the pre-existing browser process, which also owns the user’s own windows. Even the *correct* PID cannot distinguish them. No PID in the ownership record, not as a fallback, not as a tie-breaker. |
| 2026-08-25 | **New requirement for I-5: TWO agent call sites, not one.** `apply_multiwindow` does not use `run_launch`; it calls `run_agent_raw` per window and discards the output, keeping only `{title, placed}`. Threading the handle through `run_launch` alone would leave every multi-window app unowned and silently never torn down. |
| 2026-08-25 | **Two instrument findings (S-1, S-2), both caught by controls.** A byte search of the .NET agent binary is blind — the control string `capture-layout` also returned 0 — so no "binary does not contain X" claim about the agent is admissible; use behavioural tests. And the agent’s `1.0.0+<commit>` stamp reflects **HEAD, not the working tree**: the instrumented build carried the identical stamp. Handbook §10’s pre-ship stamp check is necessary but NOT sufficient — **I-14 must also check `git status` on the WinAgent repo.** Flag for the handbook at programme close. |
| 2026-08-25 | **I-4: rollback tag moved to the WinAgent repo.** The plan listed `pre-qp-switch-agent-hwnd` among the app-repo tags, but this increment changes only `Program.cs`. Cut in the WinAgent repo instead; §4’s tag list corrected to say which repo each tag belongs in. |
| 2026-08-25 | **S-2 applied for the first time.** The bundled agent was verified by stamp **and** by `git status` on the WinAgent repo, since I-3 proved the stamp cannot see a dirty tree. This pairing is now the check for every agent build, including I-14. |
| 2026-08-25 | **I-5 Steps were undoable as written, and the fix is a small agent addition (§0.3: shown to make authorised work wrong).** The step said to extract `hwnd` + `exe` from the agent result; the agent emits no exe. Substituting the Layout’s `program` path would compare the path we **launched** against the path the **window** reports — different quantities, measured differently, and they diverge for handed-off launchers. The agent gains `hwndExe` so the record stores what the window itself says and revalidation compares like with like. |
| 2026-08-25 | **New standing rule from an incident in I-5: never restore uncommitted work with git.** Restoring after a mutation with `git checkout -- <file>` reset the file to HEAD and destroyed the whole increment — implementation and all ten tests — because none of it was committed. The suite quietly returned to 8 passing, which reads as success unless the count is checked. **When mutation-testing uncommitted work, copy the file first and restore from that copy.** Version control knows nothing about work it has not been given. |
| 2026-08-25 | **I-6 ships with ONE verification open, and the dashboard says so.** The elevated branch’s classification and naming are proven; `IsWindowElevated`’s real detection is not, because no elevated window existed and obtaining one needs a UAC prompt. Carried to the operator checkpoint (iVMS-4200). Marked `✅*` rather than a plain tick. |
| 2026-08-25 | **The I-1 capture-omission phenomenon recurred, and nearly produced a false alarm.** A post-test capture showed no Notepad, which would have read as "a window with unsaved work vanished during a teardown increment". Direct enumeration found it wholly intact — same PID, same handle, same `*` marker. Twice now. This is the concrete justification for deciding "gone" by probing the handle rather than by absence from a window list: built the other way, `--close-tracked` would have reported that Notepad closed. |
| 2026-08-25 | **I-7 resolves D-3, D-4, D-5 as recommended.** D-3: the session marker is the *first* approximate boot time computed in this Windows session, persisted; on later starts it is re-established with a ±120 s tolerance so an InstaDesk restart within the same session **reuses the identical id**, while a reboot yields a new one. Tolerance sits at establishment only — the record stores an exact id and `revalidate_owned_window` compares it exactly, so the pure function keeps the contract its tests were written against. D-4: re-applying the live preset is a **refresh** (tear down, re-apply). D-5: single Layouts participate — what is live is whatever InstaDesk last applied. |
| 2026-08-25 | **Design call: the two revalidation implementations must AGREE, not merely coexist.** Only Rust can answer "is this record from this Windows session?" (it persisted it); only the agent can answer "is this handle still the window we recorded?" (it has Win32). That split risked leaving I-5’s tested `revalidate_owned_window` alive only in tests — a check nobody has seen run. So `--close-tracked` now also returns the raw probe (`probedIsWindow`, `probedExe`) for each record, and Rust independently recomputes the verdict and **cross-checks it against the agent’s classification**. Two implementations that must agree is stronger than one, and a disagreement is itself a defect signal rather than a silent divergence. |
| 2026-08-25 | **New standing rule: any Rust test that touches the agent must pin `AGENT_PATH`.** `init_paths()` never runs under `cargo test`, so `agent_path()` falls through to the dev-tree agent at `winagent/.../publish/sidecar/` — which on this machine is stamped `b250b31`, from 2026-07-27, before v0.3.0, and emits no `hwnd`. I-7’s first live run failed on that and looked like a defect in the switch. This is the *other face* of the recorded dev-Sandbox trap: `--dev` uses the bundled agent, but `cargo test` uses the stale sidecar. The worse outcome is a test that **passes** against month-old behaviour. |
| 2026-08-25 | **Third sighting of the capture-omission phenomenon.** `--capture-layout` reported 2 Explorer windows where a direct enumeration found 6. Cleanup in I-7 was therefore done by enumeration and exact title match, never from a capture. |
| 2026-08-25 | **I-9 adds ES alongside EN, changing I-12’s job.** The plan said "EN strings only at this stage", but the i18n parity gate runs on every build: EN-only would either fail it or require ES placeholders holding English text — and a placeholder that satisfies the gate is invisible to it afterwards, which is how untranslated strings ship. Both locales were written properly together. **I-12 is now a verification sweep, not a translation batch.** |
| 2026-08-25 | **D-7 (new, settled in I-9): the Ctrl+Alt+1..9 hotkeys honour Switch mode.** It governs the transition, so it governs every way of triggering one. A button that swaps while a hotkey stacks would give one setting two meanings depending on how it was reached — the ambiguity §1 rejected. |
| 2026-08-26 | **A suspected D-3 defect was investigated and REFUTED — the instrument was wrong, not the design.** The session id changed between two runs (1787587487 → 1787681405, ~26 h apart) with no reboot apparent, which looked like sleep/hibernate corrupting the boot estimate. Measurement showed the machine **had** rebooted (2026-08-25 13:10; the operator’s InstaDesk PID 1480 was gone; uptime 1 day), so a new id was correct and the planted record was rightly discarded as belonging to a previous session. The alarm came from `[Environment]::TickCount64` returning blank under PowerShell 5.1 and a timezone-skewed `-UFormat %s`. **D-3 behaved exactly as designed.** Recorded because the near-miss was a false defect report, which would have been as costly as a missed one. |
| 2026-08-26 | **Heredoc backslash trap struck a third time**, corrupting an exe path written for a test fixture (`1.0` → vertical tab). The planting step is now a **file** (`scratchpad/plant.py`) that asserts the path survived and contains no control characters. Stop writing backslash-bearing content through heredocs. |
| 2026-08-26 | **I-6’s open verification is CLOSED: `IsWindowElevated` works on a real elevated window.** iVMS-4200’s window was probed through `--close-tracked` with a **deliberately wrong exe**, so it could not be closed by any branch. The agent returned `skippedElevated`, *"runs as administrator, so Windows will not let InstaDesk close it"*, with `probedExe: null` — and the window was untouched. No hook, no simulation, no UAC prompt. |
| 2026-08-26 | **My checkpoint-2 instruction was WRONG, and the app was right.** I asked the operator to start iVMS by hand and expect it in the report. It cannot appear: the teardown only ever touches handles in the **ownership record** (invariant I-2), and the record holds only what InstaDesk itself opened — verified, the Sandbox record contained exactly one Edge window. A hand-started app is invisible to it **by design**. "Nothing was shown" was the correct behaviour; the instruction asked for a demonstration the design forbids. |
| 2026-08-26 | **Another instrument lied, and the app’s own detector was the reliable one.** My PowerShell elevation proxy (`$_.Handle` throwing) reported **all nine** iVMS processes as *not* elevated. The agent’s `IsWindowElevated` — OpenProcess + token elevation, the check that actually governs behaviour — says elevated, and it is authoritative. Had I trusted the proxy I would have "corrected" a true finding into a false one. |
| 2026-08-26 | **ANSWERED (control flow, not yet measured): an elevated window CAN enter the ownership record, so `skippedElevated` is reachable in production.** Two halves. (a) *Resolution works* — measured: `SnapshotWindowsForProcess` uses `GetProcessesByName` + `EnumWindows` + PID match, all readable across the integrity boundary, and iVMS’s window was enumerated successfully here. (b) *A blocked placement does not abort* — read from control flow: `SetWindowPos`’s return value is **never checked** at any of its eight call sites, and no placement failure throws, so a UIPI-blocked move fails silently and execution continues to emit `ok:true` with the handle. An elevated app in a Layout is therefore recorded (though never actually moved), and a later swap reports it by name and leaves it alone. ⚠ **Half of this is a code read, not a measurement.** The safe confirmation — add iVMS to a Sandbox test preset, apply, then switch — needs the operator, because launching it may raise a UAC prompt. |
| 2026-08-26 | **Why the obvious probe was NOT run.** `--single-instance --no-move` would have resolved the existing window without launching or moving it — except iVMS’s only visible window is **159×27**, a tray stub that would likely fail the agent’s minimum-size validity test, at which point the agent falls through to **launching** iVMS and could raise a UAC prompt. Checking the window’s size before running the probe is what caught this. |
| 2026-08-26 | **Parked (§0.3, pre-existing, NOT this programme’s):** the Spanish tour text mixes *"Layout"* and *"app"* with the *"Diseños"* used elsewhere in the Spanish UI (`monitor.manageQPsTitle` says *"paquetes de Diseños"*). A terminology inconsistency inherited from v0.4.0. Changing established UI vocabulary mid-programme would be scope creep; raised for a later decision on whether the Spanish keeps English product terms deliberately. |
| 2026-08-26 | **⚠ OPERATOR-REPORTED DEFECT A — PRE-EXISTING in v0.4.0, and it can DESTROY data.** A Layout containing a `multiWindowApp` assignment loads **EMPTY** when edited. `parsePresetIntoCells` (`layoutBuilder.ts:336`) skips any assignment with no top-level `title` — and a `multiWindowApp` has none, because its titles live inside `windows[]`. Its warning says *"An assignment is missing its title; skipped"*, which does not tell the user an entire app was dropped. **If the user then clicks Save changes, that assignment is overwritten out of existence.** This is why the operator sees it in the Sandbox and not in production: the Sandbox’s `general_A` is the Observatory multi-window launcher, and **none** of their six production Layouts uses that type (verified by reading all ten files). NOT this programme’s work and NOT fixed here (§0.3) — raised for its own increment. |
| 2026-08-26 | **⚠ OPERATOR-REPORTED DEFECT B — PRE-EXISTING in v0.4.0: the save control is on a different tab from the editing.** The flow works — Edit loads the Layout, `editingLayoutId` lives in `AppState` so it survives the tab change, and an amber *"Save changes to Layout X"* banner offers a one-click overwrite. But `RightPane.tsx:83` mounts `LayoutsPane` **only** while the Layouts tab is selected, and changing a monitor’s window configuration happens in the grid and the Apps tab. The user must navigate **back** to Layouts to find the save. Nothing is broken; it is undiscoverable, which for the user is the same thing — hence *"I can’t find a way to save the changes"*. NOT fixed here. |
| 2026-08-26 | **DEFECT C was MINE, and is fixed.** The I-1 fixtures `general_S` / `general_T` were written without the `name` field that **every** app-written Layout carries (verified across all ten files). Cosmetic — the list falls back to *"Layout S"* — but it made the Sandbox’s Layouts differ in shape from anything the app produces, which muddied exactly the comparison the operator was trying to make. Both fixtures now carry a name and match the app’s key order in both data dirs. **Hand-written fixtures must match what the app writes, or they become a confound in every later diagnosis.** |
| 2026-08-26 | **⚠ NEAR-MISS: invariant I-1 was broken by the verification itself.** Testing the defect-A fix, the operator added **VS Code** to Sandbox Layout A — which Quick Preset *"xxx"* reaches, with Switch mode ON and a live record already present. Applying it would have launched and then recorded a VS Code window for a later teardown to close. The agent’s `--new-window` handling refuses the "grab an existing window" fallback, so it should only ever have closed the window it opened — but that "should" was never tested against `Code.exe`, deliberately, because the failure mode ends the session. Entry removed (3→2 assignments, Observatory intact), both data dirs re-swept **separately**, control re-bitten. **The lesson: an invariant about test data is broken most easily by the person running the test, not by the code.** |
| 2026-08-24 | **Parked finding (§0.3, not fixed here):** `ui/src/services/version.ts:8-10` claims `IS_SANDBOX` disables auto-update via `services/updater.ts`. It does not — `IS_SANDBOX` appears only in its own definition and `TopChrome.tsx:55`. The isolation is really the endpoint override in `tauri.sandbox.conf.json`. A comment asserting a safety property the code does not implement. |

---

*Consult before acting. Update in the same turn after. Nothing happens off-plan.*

# InstaDesk — Session Resumption & Working Handbook

> **Authoritative on‑ramp for any new Claude Code session working on InstaDesk.**
> Read this file **in full** before the first substantive action. It is the source of
> truth for *how we work*; live *version* facts are in `CHANGELOG.md` / `gh release list`
> (if this doc and the repo disagree on a version, **the repo wins**).
>
> Last updated: **2026‑09‑10**, at the CLOSE of the **Desktop Partition** front (live: **v0.6.0**).

---

## §0 — START HERE (first 60 seconds of a new session)

1. **Read this file completely.** Then load the InstaDesk memory hub
   (`memory/project_instadesk.md`) and only the spokes it routes that the task needs.
2. **Verify the live version against the repo, not memory:**
   ```bash
   cd "C:/FcXe Studios/Instadesk/instadesk-tauri" && head -20 CHANGELOG.md
   gh release list --repo FCCXE/InstaDesk-V2.0 --limit 3
   ```
3. **Confirm a clean rollback point exists** (it does — the last release tag). We do
   **not** start feature work without a known‑good tag to roll back to (see §7).
4. **Ask the operator to define the one feature/upgrade for this session**, then work it
   in small, verifiable steps (§5) and ship it through the full gate (§4 → §6).

**⚑ THE RATIFIED METHOD (operator, 2026‑08‑23). This is not optional and not a summary.**
Anything larger than a one‑line fix runs three phases, in order:

> **Phase 0 — Deep investigation.** A written evidence document *before* any plan. Measure the
> baseline (run the gates and record they were green **before** you start), enumerate the surfaces,
> compute the constraints, name the unknowns. Evidence only, no design commitments.
>
> **Phase 1 — The work plan.** One document of record in `docs/workplans/`. Numbered increments,
> each with a *Done when*, a rollback point, a dry run, a verification, and a status field.
>
> **Phase 2 — Implementation, one increment at a time**, each repeating the cycle in miniature:
> **re‑investigate → rollback point → smallest verifiable step → gate → dry run → wire →
> real working verification → update the plan in the same turn.**

**Five rules that govern every increment:**
1. **Consult the plan before acting; update it after — same turn.** Both duties or neither.
2. **One place per fact.** The plan holds status. `CHANGELOG.md` holds what shipped. This handbook
   gets a pointer, never a copy.
3. **Nothing happens off‑plan.** A mid‑flight finding is *recorded at once and then left alone*
   unless it is **shown** to make authorised work wrong.
4. **A check is written BEFORE the code it guards, and is proven to BITE before it is trusted.**
   A check nobody has seen fail is not evidence. Record the bite‑test transcript.
5. **Verify, never assume.** Re‑derive facts from the source; never quote a remembered number.

**Working posture:** partner mode — decisions, not menus. Lead with a recommendation
(`Recommended: …`), close with a next step, and end **every** output with a short
plain‑language **non‑technical brief**. **English only** (Spanish belongs to other
projects). Absolute Windows paths when handing the operator anything to run, and say
**WHERE** each command runs.

---

## §1 — What InstaDesk is

A Windows **launcher‑and‑layout tool for multi‑monitor power users**: assign apps to a
per‑monitor grid → save as a **Layout** → one click launches the apps *and* tiles them.
Plus **Quick Presets** (bundled Layouts), **Snap** / drag‑to‑snap, URL groups, per‑cell
launch args, multi‑window‑app support, Minimize/Restore all, and (v0.3.0) **Close all
windows**. It is FcXe Studios' first commercial product.

**Architecture — Tauri v2:**
```
React 19 / Vite 7 / Tailwind 4  (UI)
        │  invoke()
        ▼
Rust backend  (src-tauri/src/backend.rs, lib.rs)   ← all app logic; former Python tier absorbed & deleted
        │  shells out to the sidecar
        ▼
C# .NET 8 WinAgent  (winagent/InstaDesk.WinAgent/Program.cs)  ← all Win32 work (SetWindowPos, enum, WM_CLOSE, …)
```
The UI runs inside a fixed **1280×820 "construct"** scaled to fit the window
(`ui/src/App.tsx`, balanced‑fit). `position:fixed` modals must portal to `document.body`
or they get trapped by the scaled transform.

---

## §2 — Where we work (TWO repos — this matters)

| Repo | Local path | Remote | Holds |
|---|---|---|---|
| **App** | `C:\FcXe Studios\Instadesk\instadesk-tauri` | `FCCXE/InstaDesk-V2.0` | UI, Rust backend, configs, scripts, docs, CHANGELOG, **version SoT** |
| **WinAgent** | `C:\FcXe Studios\Instadesk` | `FCCXE/FcXe-Studios---InstaDesk` | the C# WinAgent source (`winagent/InstaDesk.WinAgent/`) |

**Gotchas that have bitten us:**
- The **app repo is nested *inside* the WinAgent repo's directory.** In the WinAgent repo,
  `instadesk-tauri/` shows as untracked — **never `git add` it there.** Always commit with
  **explicit file paths**, never `git add -A`.
- The **release robot builds the WinAgent from the WinAgent repo's `main` HEAD.** So any
  `Program.cs` change **must be committed + pushed to the WinAgent repo FIRST**, before the
  app‑repo tag is pushed — otherwise the robot builds the *old* agent.

**Version system of record:** `src-tauri/tauri.conf.json` (`version`) + `src-tauri/Cargo.toml`
(`[package] version`), kept equal by `bump-version.mjs`. `CHANGELOG.md` (newest under
`## [Unreleased]`), the `vX.Y.Z` git tag, and the GitHub Release must always agree.

---

## §3 — How we work together

- **Operator:** Fabián (fabian.crizon@gmail.com), FcXe Studios. Decisive, hands‑on,
  values autonomy and being shown results over being asked to choose. Do not present
  multiple‑choice menus; recommend and proceed.
- **Every output ends with a plain‑language brief** ("In plain terms: …").
- **English only** for InstaDesk.
- **State WHERE** each command runs; give **absolute** paths for anything the operator
  opens or runs.
- **Never send information outside the workstation.** Deliverables are `.md` files in the
  repo. A private GitHub repo under the operator's account is a permitted backup; never
  publish a public/claude.ai artifact of internal material.
- **Show, don't tell:** for UI/behaviour changes, bring up the live Sandbox (`--dev`) so
  the operator sees the real thing before anything ships.

---

## §4 — The gates (nothing ships until these pass)

**a) UI gate (any UI/TS/i18n change):**
```bash
cd "C:/FcXe Studios/Instadesk/instadesk-tauri/ui" && npm run build      # = tsc -b && vite build
```
> `tsc --noEmit` is a **no‑op** here — `npm run build` is the real typecheck gate.

**⚠ `npm run build` NOW CARRIES NINE AUTOMATIC GATES **and the vitest suite**. Do not bypass them.**
`ui/package.json` defines `prebuild` → `checks`, and npm runs `pre<script>` automatically. They
therefore fire at **three** points that already exist and are already mandatory: every local
`npm run build`, every Sandbox build, **and every release‑robot build** (`npx tauri build` →
`beforeBuildCommand` → `npm --prefix ui run build` → `prebuild`). **A release cannot exist if one
fails.**

| Gate | Refuses the build when |
|---|---|
| `check-i18n-parity.mjs` | EN/ES key sets differ, a key is duplicated, or a path is an object in one locale and a string in the other |
| `check-tour-safety.mjs` | any file under `src/tour/**` references an action that mutates the desktop, destroys saved data, or is a destructive `AppState` mutator — or calls `invoke()` directly |
| `check-tour-anchors.mjs` | the anchor registry and the `data-tour` attributes disagree **in either direction**, an anchor moved component, or a walkthrough step names an unregistered anchor |
| `check-tour-content.mjs` | the walkthrough states something untrue (e.g. a grid size the app does not offer), or a chapter/step has no text key |
| `check-updater-purity.mjs` | a side effect sits inside a React state updater, which React may run more than once |
| `check-layout-yield.mjs` | a control with a hard `min-w-[Npx]` floor sits in a flex row that cannot wrap — it will overflow at some label length |
| `check-changelog-clean.mjs` | an internal engineering note sits in a RELEASED CHANGELOG section, which is published verbatim as the release body |
| `check-source-bytes.mjs` | a source file contains a raw control character (an escape eaten at authoring time) |
| `check-backend-errors.mjs` | a backend error code has no translation in BOTH locales |

`prebuild` is `checks && test`, so the **64‑test vitest suite** runs at the same three points. The UI
had **zero** tests before 2026‑08‑27.

Each was **proven to bite** before being trusted. `npm run build:check` and a bare `vite build`
**bypass** `prebuild` — they are dev conveniences, not gates. Husky is installed but **inert**
(default 10‑byte hook, `core.hooksPath` unset); wiring it would run an undefined `npm test` and
break every commit. Do not "fix" it.

**⛔ Never weaken a gate to stop it complaining.** If one fires on a false positive, make the check
*more precise* and re‑bite it in both directions. Rewording code to appease a check trains the
reflex to silence it, which is how a gate rots into decoration.

**b) Rust gate (if `src-tauri` changed):**
```bash
cd "C:/FcXe Studios/Instadesk/instadesk-tauri/src-tauri" && cargo test --lib && cargo build --lib
```

**c) Sandbox validation gate — UNCONDITIONAL (RELEASING.md §3.5).**
No version is promoted until it passes the local, robot‑free **Sandbox** — an isolated,
side‑by‑side build (`com.fcxestudios.instadesk.sandbox`, productName "InstaDesk Sandbox",
window title "InstaDesk — SANDBOX", on‑screen orange **SANDBOX** badge, and its **own
icon** — `src-tauri/icons/sandbox/`, an amber disc on the InstaDesk mark, declared
under `bundle.icon` in `src-tauri/tauri.sandbox.conf.json`). ⚠ **The icon was MISSING
until 2026‑09‑10** — the override set productName, binary name, identifier and title but no
icon, so the Sandbox shipped production’s icon byte‑for‑byte. The badge is *inside* the window
and cannot help on the taskbar, in Alt‑Tab, on the Start menu or on a shortcut — exactly where
you choose which app to launch. It builds
entirely locally, never auto‑updates, ships no updater artifacts, and can never touch
stable users. The gate is unconditional — **no rationalizing a skip** even for a
"one‑line, already‑validated" fix (we were caught skipping it on 0.2.1).

- **Iterate live (no install):** `node src-tauri/scripts/sandbox.mjs --dev`
  — hot‑reload, badge, isolated identity. Fix until correct.
- **Build the real artifact:** `node src-tauri/scripts/sandbox.mjs`
  → `src-tauri/target/release/bundle/nsis/InstaDesk Sandbox_<version>_x64-setup.exe` (unsigned).
- **Validate the packaged product:** operator installs it (upgrades only the Sandbox app)
  and confirms badge + version + the change works.

**⚠ WinAgent testing trap (cost us a debug cycle on 2026‑07‑29):** `sandbox.mjs --dev`
runs the **bundled** agent at `src-tauri/binaries/InstaDesk.WinAgent.exe`, *not* the
`winagent/.../publish/sidecar` dev‑fallback (the `binaries/` exe exists, so `init_paths()`
resolves it even in dev — the `backend.rs` comment claiming otherwise is wrong). So after
any `Program.cs` change, **rebuild the bundled agent before `--dev`:**
```bash
node src-tauri/scripts/build-agent.mjs     # publishes self-contained exe → src-tauri/binaries/InstaDesk.WinAgent.exe
```
or, belt‑and‑braces for one run, launch with `AGENT_PATH` pointed at the fresh exe
(`agent_path()` honours it first). The full `sandbox.mjs` installer build and the release
robot both re‑run `build-agent.mjs`, so only the `--dev` quick‑loop needs this.
(See memory spoke `feedback_instadesk_dev_sandbox_uses_bundled_agent`.)

---

## §5 — The development loop (small, verifiable, dry‑run‑first)

1. **Assess first, in prose**, grounded in the actual code (read the files, don't guess).
   Give a `Recommended:` direction.
2. **Change in the smallest verifiable increment.** Prefer targeted edits; match the
   surrounding code's idiom and comment density.
3. **Gate the increment** (§4a/b) — compile/typecheck before showing anything.
4. **Dry‑run / live preview in the Sandbox** (`--dev`) so the operator sees it. Hot‑reload
   for cosmetic tweaks; leave the Sandbox window open for instant iteration.
5. **Iterate** on operator feedback until "works/looks as expected."
6. **Only then** run the full Sandbox installer gate (§4c) and release (§6).

Multi‑layer features (like Close all windows) touch **WinAgent → Rust → api.ts → UI →
i18n(en/es)** — wire all layers, mirror an existing analogous path (e.g. `arrange_all_windows`
↔ `close_all_windows`), and keep i18n EN/ES in parity.

---

## §6 — The release procedure (automated robot)

Pre‑flight checklist: all gates green (§4), `CHANGELOG.md [Unreleased]` describes the
release, version decided (SemVer, §7), Sandbox gate passed.

**SemVer (pre‑1.0):** new user‑facing feature → **MINOR** (`0.2.1 → 0.3.0`); fix/docs →
**PATCH**; `1.0.0` reserved for the commercial milestone.

**Steps (run from the app repo root unless noted):**
1. **Write `CHANGELOG.md`** under `## [Unreleased]` (Added/Changed/Fixed).
2. **Bump:** `node src-tauri/scripts/bump-version.mjs <X.Y.Z> --dry-run` to preview, then
   without `--dry-run` — it updates `tauri.conf.json` + `Cargo.toml` and rolls
   `[Unreleased]` → `[X.Y.Z] - <date>`. (`cargo build` then moves `Cargo.lock` to the new version.)
3. **Push the WinAgent repo FIRST** (if `Program.cs` changed):
   `git -C "C:/FcXe Studios/Instadesk" commit -m "…" -- winagent/InstaDesk.WinAgent/Program.cs && git -C "C:/FcXe Studios/Instadesk" push origin main`
4. **Commit + push the app repo** with **explicit file paths** (code + version files +
   `Cargo.lock` + `CHANGELOG.md`); leave untracked/unrelated files alone.
5. **Tag + push the tag** — this triggers the robot:
   `git -C "C:/FcXe Studios/Instadesk/instadesk-tauri" tag vX.Y.Z && git ... push origin vX.Y.Z`
   - **Clean tag** `vX.Y.Z` → published as **Latest** (reaches all users).
   - **Suffixed tag** `vX.Y.Z-rc.1` → **prerelease** (never Latest; safe test).
6. **Verify (§5 of RELEASING):**
   ```bash
   curl -sL "https://github.com/FCCXE/InstaDesk-V2.0/releases/latest/download/latest.json" | grep '"version"'
   gh release view vX.Y.Z --repo FCCXE/InstaDesk-V2.0 --json isPrerelease,assets --jq '{prerelease:.isPrerelease, assets:[.assets[].name]}'
   ```
   Expect the live version to match, `isPrerelease:false`, and 3 assets (installer, `.sig`, `latest.json`).

**Commit hygiene:** specific file paths (never `-A`); atomic `git commit … -- <paths>`;
end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
Commit/push only when the operator has authorized the release.

**Rollback (if a release is bad):** roll *forward* — fix, bump a new patch, ship (the
updater follows `latest.json`); or re‑point Latest to the previous good release
(`gh release edit v<good> --latest`). See RELEASING.md §6.

---

## §7 — Rollback points & safety invariants

**Safe rollback point:** the **current release tag is the rollback point.** As of this
handoff that is **`v0.6.0`**.

**Per‑increment `pre-*` tags.** `docs/RELEASING.md §7` defines `pre-<slug>` as disposable local
safety markers cut before risky edits — distinct from the `vX.Y.Z` version record, kept **local**,
prunable. There are 160+ in this repo; the v0.4.0 programme added five
(`pre-assisted-help-v1`, `-anchors`, `-engine`, `-navstate`, `-snapshot`). **Cut one before every
increment marked risky**, and reset to it rather than leaving a half‑wired increment as "done". Before starting a risky modification,
confirm a clean tagged/committed state exists to return to; if mid‑flight work must be
abandoned, `git reset`/checkout back to the last good tag.

**Hard invariants (do not violate):**
1. **Never `Stop-Process -Name Code`** and **never smoke‑test `/launch` on `Code.exe`** —
   VS Code hosts this Claude Code session; killing it self‑terminates. Test on Notepad/Chrome/Edge.
2. **Ship via published signed releases only** — never hand‑patch a user‑facing build.
3. **Sandbox gate is unconditional** (§4c).
4. **Push a rollback tag / ensure a clean tag before feature work**, and commit → push to
   **both** repos in the same turn when both changed.
5. **Gate every UI change on `npm run build`.**
6. **English only.** Keep EN/ES i18n in parity for any string‑facing change.
7. **WinAgent change → push WinAgent repo before the app tag** (robot builds from its HEAD).

---

## §8 — Current state (verify before trusting)

- **Live: v0.6.0** (2026‑09‑10) — the **Desktop partition**, its guided‑tour chapter in both
  locales, and a distinct Sandbox icon. Verified from the published `latest.json` **through `gh api`, not
  `curl`** — the CDN served stale bytes on 08‑27 and nearly convinced a session that a good upload
  had failed. Both repos clean on `main`.
- Three releases shipped on 2026‑08‑27: **v0.5.0** Quick Preset Switch mode, **v0.5.1** editable URL
  groups + favorites, the grid clipboard, and readable **translated** backend errors, **v0.5.2** the
  grid‑pane *Unassign*.
- **The PDF manual was removed in v0.5.1.** The app teaches itself: Guided Tour + Help, both locales,
  both gated. The PDF was the one teaching surface with **no gate** and the only one that rotted —
  eight releases behind, still printing v0.1.28 on its own pages.
- **`prebuild` is now nine gates plus the vitest suite** (§4). The UI had zero tests before 08‑27.
- **Backend errors are CODED, not prose.** Rust emits a stable code; the UI translates it. A lookup
  keyed on the English sentence would break on the first reword.
- Closed programme records, each with its amendment log — **read those logs, they carry the traps
  paid for**: `QUICK_PRESET_SWITCH_WORK_PLAN_v1_0.md`, `URL_GROUP_EDITING_WORK_PLAN_v1_0.md`,
  `WIRING_AUDIT_v1_0.md`.
- **Carried open, deliberately:** whether an elevated window *enters* the ownership record via a real
  Apply is a **code read, not a measurement**. Worst case is benign (a swap omits it from the
  "left open" list); *never closing what it shouldn't* **is** proven on a real elevated window.

> ⚠ **This section was two releases stale until 2026‑09‑10** — it still named v0.4.0 as live and
> Quick Preset Switch as the open front, three weeks after that shipped. A session following it
> literally would have rebuilt a shipped feature. **One place per fact: this section is state, the
> work plans hold increment status, and `gh release list` outranks both.**

### ✔ CLOSED PROGRAMME — DESKTOP PARTITION (opened and shipped 2026‑09‑10, v0.6.0)

> **Operator accepted 2026‑09‑10:** *"Version 0.6.0 working as expected."* There is **no active
> front**. The record is `docs/workplans/DESKTOP_PARTITION_WORK_PLAN_v1_0.md` — **read its amendment
> log**, it carries traps paid for in full.

> ⚠ **THREE THINGS SHIPPED AS KNOWN, NOT AS FINISHED.** None is a defect; each is recorded so nobody
> re‑derives it or assumes it was proven:
> 1. **The watcher has never been observed performing a real restore.** Every logged run ended in a
>    legitimate refusal or *"already correct"*; `moved` has never been above zero. The re‑apply PATH
>    is proven (atomic positioning, verified byte‑identical against a baseline); the watcher
>    **invoking** it on a genuinely disturbed desktop has not been caught in the act.
> 2. **The layout is not stable across a resolution change.** It flows AROUND the icons that are
>    never moved (Recycle Bin, `desktop.ini`), and Windows relocates those — so everything
>    downstream shifts by one cell. Anchoring zones to fixed cells rather than to a fill order would
>    remove it; that is a design change, unbuilt.
> 3. **`desktop_undo` takes the NEWEST capture**, so applying twice and undoing once returns to the
>    previous tidy state, not the original. Correct as *"undo the last apply"*; there is no way to
>    step back further.

> ⛔ **I‑6, visual panels, was NEVER STARTED and needs explicit operator authorisation.** It is the
> only piece that mutates Explorer’s window tree (`WorkerW` re‑parenting), and everything shipped is
> useful without it.

<details>
<summary>The front as it stood while open (kept for its rulings)</summary>


> **Desktop icon zoning.** Select a monitor, define zones, and keep desktop **folders** on one side
> and **app icons** on the other — and *keep* them there. Operator‑ruled, 2026‑09‑10.

**Phase 0 is CLOSED and its evidence is not to be re‑derived:**
`docs/workplans/DESKTOP_PARTITION_INVESTIGATION_v1_0.md` — measured live on 2026‑09‑09 by a
non‑InstaDesk session. Carries the desktop topology, the 65‑item reconciliation, the four repo traps
and the feasibility verdict. **Read it before the plan.**

**Four operator rulings that govern the build (2026‑09‑10):**
1. **Folder‑shortcuts count as FOLDERS**, not apps — a drive shortcut opens a folder. This overrides
   the seed's unruled default (§9.1 of the seed).
2. **Built on v0.5.2**, the current standing release.
3. **The re‑apply watcher ships in the FIRST version** — *"keep it tidy is a must"*. Windows persists
   no icon positions at all, so without it the feature un‑tidies itself the first time Explorer
   restarts.
4. **The whole feature is a selectable ON/OFF**, and when OFF it must do genuinely nothing to the
   desktop — no watcher, no re‑apply, no Explorer window‑tree mutation.
5. **Items are ordered ALPHABETICALLY within their zone** (added 2026‑09‑10).
6. **The feature is implemented and tried in the SANDBOX app before any release** (added
   2026‑09‑10). The agent CLI is a build layer beneath the product, not where it is validated.

**Three things a resuming session must know:**
1. **This programme changes `Program.cs`.** The two‑repo sequencing rule (§2) is live.
2. **It writes into `explorer.exe`'s address space** to move icons. That is the standard technique,
   but it is the most invasive thing InstaDesk has ever done. Undo (`--desktop-restore`) is built and
   proven **before** apply.
3. **`--capture-layout` already means *window* layout.** The new verbs are namespaced
   `--desktop-scan` / `--desktop-apply` / `--desktop-restore` / `--desktop-watch`.

Rollback point: **`v0.5.2`**. Programme tag: **`pre-desktop-partition-v1`** (both repos).

</details>

## §9 — Command quick‑reference (WHERE = app repo root `C:\FcXe Studios\Instadesk\instadesk-tauri` unless noted)

```bash
# Gates
cd ui && npm run build                                   # UI typecheck+build gate
cd src-tauri && cargo test --lib && cargo build --lib    # Rust gate

# WinAgent (rebuild bundled agent BEFORE testing an agent change via --dev)
node src-tauri/scripts/build-agent.mjs                   # → src-tauri/binaries/InstaDesk.WinAgent.exe

# Sandbox gate
node src-tauri/scripts/sandbox.mjs --dev                 # live preview (badge, isolated)
node src-tauri/scripts/sandbox.mjs                       # build side-by-side installer → target/release/bundle/nsis/

# Release
node src-tauri/scripts/bump-version.mjs X.Y.Z --dry-run  # preview; drop --dry-run to apply
git -C "C:/FcXe Studios/Instadesk" push origin main      # WinAgent FIRST (if Program.cs changed)
# …commit app repo (explicit paths) then:
git tag vX.Y.Z && git push origin vX.Y.Z                 # triggers robot
gh run list --repo FCCXE/InstaDesk-V2.0 --limit 3        # watch the robot
gh api repos/FCCXE/InstaDesk-V2.0/releases/latest --jq .tag_name   # VERIFY here, never curl

# Desktop partition (v0.6.0) - agent CLI. Read-only unless --apply is present.
# WHERE: C:/FcXe Studios/Instadesk/winagent/InstaDesk.WinAgent
./bin/Release/net8.0-windows/InstaDesk.WinAgent.exe --desktop-scan            # every icon + identity
./bin/Release/net8.0-windows/InstaDesk.WinAgent.exe --desktop-plan            # where each would go
./bin/Release/net8.0-windows/InstaDesk.WinAgent.exe --desktop-apply undo=<f>  # DRY RUN by default
#   …add --apply to actually move; --apply REQUIRES undo=<path>
./bin/Release/net8.0-windows/InstaDesk.WinAgent.exe --desktop-restore file=<f> --apply   # undo
./bin/Release/net8.0-windows/InstaDesk.WinAgent.exe --desktop-identity-probe  # control: both readers agree?
# Sandbox watcher log + undo captures:
#   %APPDATA%/com.fcxestudios.instadesk.sandbox/desktop-watch.log
#   %APPDATA%/com.fcxestudios.instadesk.sandbox/desktop-undo/

# Docs of record
docs/RELEASING.md   # full release SOP (this handbook summarises it)
CHANGELOG.md        # human history / what is live
```

---

*InstaDesk is a product of FcXe Studios. This handbook governs the working method; the
`CHANGELOG.md` and GitHub Releases govern what is actually live.*

---

## §10 — Traps that have actually bitten (read before debugging anything)

**Tooling**
- **This session's Bash tool is POSIX `sh`, not PowerShell.** A `@'…'@` here‑string wraps a commit
  message in literal `@` lines. Use a heredoc or `git commit -F <file>`, then **read the stored
  message back**.
- **A Bash heredoc eats backslashes.** Writing a JS regex through one turned `` into a literal
  **backspace control character (0x08)** — the read‑back *looked* correct because a control
  character is invisible, and the resulting gate reported `OK` while matching **nothing, ever**.
  Use the editor tool for anything containing escapes, then grep the escapes back out.
- **PowerShell needs quoting AND the call operator** for paths with spaces:
  `& "C:\FcXe Studios\...\setup.exe"`.
- **Backticks inside `python -c "…"` are COMMAND SUBSTITUTION to bash.** Writing a doc paragraph
  that way on 2026‑09‑10 executed three code‑span paths and replaced them with nothing; the shipped
  sentence read *"its own icon — , an amber disc … declared in  under )."* The script printed its own
  success line and the errors went to stderr among unrelated noise. **Never build file CONTENT in an
  inline shell string** — write the edit script to a file and run the file. Then **re‑open the file and
  assert the tokens are present**: a `replace()` that inserts corrupted text reports exactly the same
  success as one that inserts correct text.
- **`head` on a build pipe kills npm with EPIPE**, which reads as a failed build that never failed.
  Re‑run without truncation before believing an exit code. *Suspect the instrument.*
- **`git rev-parse <missing-tag>` echoes the argument back**, which reads as a false positive. Use
  `git tag -l`.
- **Launch the Sandbox with `run_in_background`, never a shell `&`** — a detached process dies when
  the call returns, and you will send the operator to test in a window that no longer exists.
- **Never start a release build while a dev Sandbox is alive.** Both write
  `src-tauri/binaries/InstaDesk.WinAgent.exe`; the loser fails with `os error 32` and you can get a
  binary that is the right size and quietly broken. Verify the bundled agent's PE header and its
  `1.0.0+<commit>` stamp against the WinAgent repo HEAD before shipping an installer.

**The Sandbox**
- There are **two** Sandboxes and they are easy to confuse. The **dev** one (`sandbox.mjs --dev`)
  runs from source, has the live code, has **no desktop icon**, and exists only while the dev server
  runs. The **installed** one (desktop icon → `%LOCALAPPDATA%\InstaDesk Sandbox\`) is a frozen
  package. **Only the version number distinguishes builds, and it does not change until you bump** —
  the reliable markers are the window title `InstaDesk — SANDBOX` and the orange badge.
- **The DEV panel does not exist in a packaged build** (`import.meta.env.DEV`). Anything that can
  only be verified through it must be verified **before** you build the installer.
- Data is isolated: `init_paths()` sets the data dir from `app_data_dir()` only when staged bundle
  resources exist, so the installed app uses `AppData` while the dev Sandbox falls back to
  `<repo>/data`. The Sandbox has never touched the operator's real Layouts.

**Judgement**
- **Classify by consequence, not by mechanism, and prove the categories sum.** A one‑hop call
  analysis once marked *"Apply a Layout"* safe for a tutorial to fire; it launches programs and
  rearranges every window. Only the transitive closure, checked against an independently derived
  total, was correct.
- **An empty or null value asks HOW it became empty.** `querySelector` returning null means *"not
  mounted yet"* (wait) or *"deleted"* (defect) — opposite remedies. Collapsing them takes the
  reassuring reading.
- **Gates verify structure; nothing verifies that prose is TRUE.** Three green gates once shipped a
  walkthrough describing grid sizes the app does not offer. A human reading the screen caught it.
- **A CHECK WRITTEN AFTER A DEFECT COVERS ONLY THE SHAPE THAT DEFECT TOOK.** `check‑tour‑anchors` was
  hardened in August after a step pointed inside `favorites.map(...)`. On 2026‑09‑10 the identical
  failure arriving as `{flag && (` sailed straight through, and `kind:"tab"` anchors were skipped
  entirely. **After fixing a defect, ask what OTHER shapes the same failure can take.**
- **A VALUE MEASURED IN ONE CONFIGURATION IS A SAMPLE, NOT A CONSTANT.** The desktop icon‑grid inset
  was measured as 31, called "measured, not assumed", and **Windows moved it to 33 at another
  resolution**. Derive per run where the cost is trivial. What made it survivable: the grid check was
  written before the code it guards, so a wrong grid produced a **refusal** instead of 66
  plausible‑looking wrong positions.
- **A SAFETY NET BUILT FROM THE SAME PRIMITIVE AS THE OPERATION CANNOT CATCH THAT OPERATION’S
  FAILURE.** Apply moved icons one at a time and displaced four it had promised never to touch; the
  **undo used the same per‑item writer** and displaced them again, leaving 23 of 65 unrestored — and
  it had been "proven" by a test that restored an **undisturbed** desktop, so it moved nothing and the
  failure could not appear. **Test the undo against a state the operation has actually disturbed.**
  ⇒ When per‑item writes interact, **look for the batch API** (`IFolderView::SelectAndPositionItems`)
  before engineering an ordering.
- **A BEHAVIOURAL TEST IS WORTHLESS WHEN THE ENVIRONMENT PRODUCES THE SAME BEHAVIOUR BY ITSELF.** I
  asked the operator to prove the watcher stops with the app by closing it and restarting Explorer —
  **but Explorer restores icon positions across its own restart**, so the layout survives either way.
  The test had no failing branch. **Measure the invariant directly** (is the process running?).
- **WHEN THE ARTIFACT IS SOMETHING A PERSON ACTIVELY USES, THE PERSON IS A HYPOTHESIS.** A scattered
  desktop was diagnosed as *"Explorer repacked it and the watcher missed it"* and written into a plan
  and a commit as an observed failure. **The operator had rearranged the icons by hand.** The evidence
  fitted both causes equally. **Twice now** I have offered only explanations located in my own code.
  If the evidence cannot separate the causes, **ask**.
- **A FALLBACK THAT CANNOT BE SEEN FIRING IS INDISTINGUISHABLE FROM SUCCESS.** All 65 identity reads
  failed; the display‑name fallback absorbed every one and the output was **byte‑identical to the
  previous version**. Only a counter added minutes earlier revealed it. **Every fallback ships with a
  count of how often it fired, and every failure path says WHICH failure it was.**
- **A POST‑CONDITION THAT EXCLUDES A CATEGORY CANNOT FIND A DEFECT IN THAT CATEGORY** — and that is
  exactly where the defect will be. A "no two icons share a cell" check ran over *placed* items only;
  the one collision in the plan was a placed item landing on an **untouched** item’s cell, and every
  total still reconciled.
- **React state updaters must be pure.** A side effect inside `setIndex` ran twice under
  `StrictMode` and emitted both `tour_completed` and `tour_abandoned` for the same tour.


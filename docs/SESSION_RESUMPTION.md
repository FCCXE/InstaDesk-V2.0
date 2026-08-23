# InstaDesk — Session Resumption & Working Handbook

> **Authoritative on‑ramp for any new Claude Code session working on InstaDesk.**
> Read this file **in full** before the first substantive action. It is the source of
> truth for *how we work*; live *version* facts are in `CHANGELOG.md` / `gh release list`
> (if this doc and the repo disagree on a version, **the repo wins**).
>
> Last updated: **2026‑07‑29**, at the close of the **v0.3.0** release.

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

**b) Rust gate (if `src-tauri` changed):**
```bash
cd "C:/FcXe Studios/Instadesk/instadesk-tauri/src-tauri" && cargo test --lib && cargo build --lib
```

**c) Sandbox validation gate — UNCONDITIONAL (RELEASING.md §3.5).**
No version is promoted until it passes the local, robot‑free **Sandbox** — an isolated,
side‑by‑side build (`com.fcxestudios.instadesk.sandbox`, productName "InstaDesk Sandbox",
window title "InstaDesk — SANDBOX", on‑screen orange **SANDBOX** badge). It builds
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
handoff that is **`v0.3.0`** (app‑repo `main` HEAD). Before starting a risky modification,
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

- **Live:** **v0.3.0** (2026‑07‑29) — shipped **Close all windows** (confirm‑gated bottom‑bar
  button; agent `--close-all` graceful `WM_CLOSE` sweep; InstaDesk + admin windows skipped/reported)
  and a **tidier bottom control bar** (buttons re‑centred, debug size readout removed).
- Both repos clean on `main`; robot run succeeded; `latest.json` serves 0.3.0.
- **Known backlog / not started:** Licensing Increment 4 (Lemon Squeezy, UK‑Ltd‑gated) —
  see memory `project_instadesk_licensing_trial_layer`. Commercial handout draft exists at
  `docs/marketing/InstaDesk-Commercial-Handout.md` (pricing placeholders pending).
- **Next:** the operator will define the new feature/upgrade for this session.

---

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

# Docs of record
docs/RELEASING.md   # full release SOP (this handbook summarises it)
CHANGELOG.md        # human history / what is live
```

---

*InstaDesk is a product of FcXe Studios. This handbook governs the working method; the
`CHANGELOG.md` and GitHub Releases govern what is actually live.*

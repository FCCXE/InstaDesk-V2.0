# InstaDesk

**Multi-monitor launcher & window-tiling tool for Windows**, by FCLX Studios.
Arrange apps on a per-monitor grid, save it as a **Layout**, and one click launches
every app and tiles it into place. Plus Quick Presets, ad-hoc Snap & drag-to-snap,
URL/tab groups, layout capture, global hotkeys, and a signed auto-updater.

- **Status:** active development; shipping signed releases via auto-update.
- **Platform:** Windows 10/11 (x64).
- **Current version & history:** see [`CHANGELOG.md`](CHANGELOG.md).

---

## Architecture (Tauri v2)

InstaDesk is a **Tauri v2 desktop app** made of three parts:

| Part | Tech | Where |
|---|---|---|
| **UI** | React 19 + Vite 7 + Tailwind v4 + TypeScript | `ui/` (this repo) |
| **Backend** | native **Rust** (Tauri commands) | `src-tauri/` (this repo) |
| **WinAgent** | **C#** / .NET 8 — does the actual Win32 window placement (`SetWindowPos`) + Snap overlay | a **separate private repo**, `FcXe-Studios---InstaDesk`, under `winagent/` |

The UI calls Rust via Tauri `invoke()` (seam: `ui/src/services/api.ts`). The Rust
backend shells out to the **WinAgent**, which is bundled into the installer as a
self-contained `.exe` resource (so the installed app needs no system-wide `dotnet`).
Presets/layouts are JSON in the OS app-data dir (release) or the agent repo's
`data/` (dev). The old Python server is retired — the backend is fully native Rust.

> **Two coupled repos:** this repo is the **app**; the **agent + data** live in the
> separate private `FcXe-Studios---InstaDesk` repo as a sibling folder. The release
> build pulls the agent from there (see Releasing).

### Folder structure (this repo)
```
instadesk-tauri/
├─ ui/                       # React + Vite frontend
│  ├─ src/                   # components, services (api.ts, telemetry.ts), state, i18n
│  ├─ public/
│  └─ package.json           # UI deps; `npm run build` = tsc -b && vite build
├─ src-tauri/                # Rust backend
│  ├─ src/                   # backend.rs, lib.rs, main.rs
│  ├─ scripts/               # build-agent.mjs, make-latest-json.mjs, bump-version.mjs
│  ├─ binaries/              # bundled WinAgent.exe (gitignored build artifact)
│  ├─ .tauri-keys/           # updater signing key (gitignored secret)
│  ├─ Cargo.toml
│  └─ tauri.conf.json        # app version (source of truth) + bundle + updater config
├─ docs/
│  ├─ RELEASING.md           # the Build & Release SOP
│  └─ manual/                # the user-manual source (HTML → bundled PDF)
├─ .github/workflows/
│  └─ release.yml            # the automated release pipeline (the "robot")
├─ CHANGELOG.md              # canonical human-readable version history
├─ README.md                 # this file
└─ package.json              # @tauri-apps/cli + `npm run dev`/`build` (= tauri)
```

---

## Prerequisites

- **Windows 10/11 (x64)**
- **Node.js 20.19+ or 22+** (Vite 7) — dev uses Node 22
- **Rust** (stable) via <https://rustup.rs/> — `cargo` on PATH
- **.NET 8 SDK** — to build the C# WinAgent
- **Visual Studio C++ Build Tools** ("Desktop development with C++") — for the Rust/native build
- **WebView2 runtime** — preinstalled on Windows 11; auto-handled otherwise
- The **agent repo** (`FcXe-Studios---InstaDesk`) checked out as a **sibling** of this repo, so `winagent/` resolves at `../winagent` relative to this folder (the release build expects this; CI fetches it automatically).

## Quick start (development)

```bash
# from this repo root
npm install                 # root tooling (@tauri-apps/cli)
npm --prefix ui install     # UI dependencies
npm run dev                 # = tauri dev: starts Vite + launches the desktop app
```

`npm run dev` starts Vite (localhost:5173) **and** opens the WebView2 desktop window.
Rust changes auto-rebuild; if the frontend looks stale, clear the WebView2 cache
(`%LOCALAPPDATA%\com.fcxestudios.instadesk\EBWebView`) and relaunch.

## Scripts & gates

| Command | What it does |
|---|---|
| `npm run dev` | `tauri dev` — Vite + desktop app |
| `npm run build` | `tauri build` — full signed/packaged build (see Releasing) |
| `cd ui && npm run build` | **THE UI gate** (`tsc -b && vite build`). Use this to typecheck — **not** `tsc --noEmit` (a no-op here, solution-style tsconfig). |
| `cd src-tauri && cargo test --lib && cargo build --lib` | Rust gate |
| `node src-tauri/scripts/bump-version.mjs <X.Y.Z>` | bump version + roll CHANGELOG |

## Building from source (local desktop build)

```bash
npm install && npm --prefix ui install
npx tauri build --bundles nsis
```
`tauri build` runs the UI build and publishes the WinAgent (`build-agent.mjs`, needs
.NET 8 + the agent repo as a sibling), then produces the NSIS installer under
`src-tauri/target/release/bundle/nsis/`. For a **signed** build (required for
auto-update), the updater key must be in the environment — see [`docs/RELEASING.md`](docs/RELEASING.md).

---

## Releasing

Releases are **automated**. Pushing a version tag triggers the GitHub Actions robot
(`.github/workflows/release.yml`), which builds, signs, and publishes the release.

```bash
node src-tauri/scripts/bump-version.mjs 0.1.29   # bump + changelog
git add -A && git commit -m "release: 0.1.29" && git push
git tag v0.1.29 && git push origin v0.1.29        # the robot takes it from here
```

- A **clean tag** (`v0.1.29`) → published as **Latest** (reaches all users via auto-update).
- A **suffixed tag** (`v0.1.29-rc.1`) → published as a **prerelease** (never "Latest",
  so it can't reach stable users) — for safe testing / beta.

Installed apps check the signed updater endpoint and install a newer release **only
if its signature matches** the public key baked into the app. The full procedure,
rollback runbook, and CI credentials are in **[`docs/RELEASING.md`](docs/RELEASING.md)**.

## The record (where build/release truth lives)

- **[`CHANGELOG.md`](CHANGELOG.md)** — canonical human-readable version history.
- **GitHub Releases + `vX.Y.Z` tags** — the immutable machine record of every build emitted.
- **`docs/RELEASING.md`** — how a build is made, shipped, and rolled back.
- **latest.json endpoint** — what installed apps see as the current version.

## License

**Proprietary — © FCLX Studios. All rights reserved.** InstaDesk is a commercial
product; this repository is private. *(Earlier drafts of this README referenced an
MIT license in error — that does not apply.)*

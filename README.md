InstaDesk

Multi-monitor tiling & workspace launcher for Windows — built with Tauri + React + Tailwind CSS v4 + Vite. InstaDesk lets you define grid layouts, assign apps to cells, and launch tidy, gap-free workspaces in a click.

Status: Active local development (Phase A)
Repo root (local): C:\FcXe Studios\Instadesk\instadesk-tauri
Primary OS target: Windows 10/11

Table of Contents

Key Features

Screens & UX Snapshot

Architecture

Folder Structure

Prerequisites

Quick Start (VS Code + PowerShell)

Scripts

Development Workflow & Guardrails

Building a Release

Testing & Sanity Checks

Troubleshooting

Contributing

Changelog

License

FAQ

Key Features

Grid Tiling UI — pick a grid (e.g., 6×6), select cells, and tile windows without gaps.

Workspace Launcher — map programs (.exe) to grid cells; launch with one action.

Persistent Selection — selections stay highlighted; Esc clears the current selection.

Gap-Free Layout Goal — stabilization logic aims to avoid visible seams between tiles.

Made for Windows — integrates with Windows windowing behaviors; built with Tauri to stay lightweight.

Developer-Friendly — Vite dev server, Tailwind v4, hot reload, clean repo hygiene.

Screens & UX Snapshot

Top chrome with grid controls and status indicator.

Main dashboard with interactive grid.

Bottom bar for actions and selection feedback.

Console triggers reserved for internal diagnostics (selection indicator visible in-UI).

Note: During development we validate that selection stays visible, numeric indicator updates, and Esc clears selection.

Architecture

Frontend (Tauri/React/Vite/Tailwind)

Interactive grid & controls

State management and selection logic

Commands bridged to Tauri backend for OS integrations

Tauri Backend (Rust)

Lightweight system calls, process launching, and window control hooks (future)

Bridges between UI and Windows APIs (progressively expanded)

Folder Structure
instadesk-tauri/
├─ src/                         # React app (Vite)
│  ├─ components/               # UI components (critical files live here)
│  ├─ pages/                    # App routes (if applicable)
│  ├─ styles/
│  │  └─ index.css              # Tailwind v4 entry (critical)
│  ├─ App.tsx
│  └─ main.tsx
├─ src/components/
│  └─ TopChrome.tsx             # Header/chrome (critical)
├─ tauri/                       # Tauri (Rust) backend
│  ├─ src/
│  └─ Cargo.toml
├─ public/
├─ package.json
├─ vite.config.ts
├─ tailwind.config.ts
└─ README.md                    # This file


Critical UI files for this project: src/styles/index.css, src/components/TopChrome.tsx, and all src/components/*.tsx.

Prerequisites

Windows 10/11

Node.js 18+ (LTS recommended)

Rust toolchain (for Tauri backend)

Install via https://rustup.rs/

Make sure cargo is in your PATH

Microsoft Visual Studio Build Tools (C++ build tools)

Install “Desktop development with C++” or Build Tools for VS 2022

VS Code (primary editor for this repo)

Git (Git LFS optional if you track large binaries later)

Quick Start (VS Code + PowerShell)

All commands below are Windows PowerShell and assume the repo root is C:\FcXe Studios\Instadesk\instadesk-tauri.

Open the repo in VS Code

# PowerShell
Set-Location "C:\FcXe Studios\Instadesk\instadesk-tauri"
code .


Install dependencies

# PowerShell (in VS Code terminal)
npm install


Run local sanity checks (custom script)

npm run sanity


Start the dev server

npm run dev


Open the app

Frontend dev server: http://localhost:5173

Tauri dev (when enabled): launches a desktop window connected to Vite

Scripts

Common npm scripts defined in package.json:

Script	What it does
npm run dev	Starts Vite dev server (and Tauri dev when configured).
npm run sanity	Runs the local “sanity” checklist (project-specific quick validations).
npm run build	Builds the frontend for production.
npm run tauri build	Builds a desktop release using Tauri (requires Rust toolchain).
npm run tauri dev	Runs the Tauri app in dev mode (desktop window).

If a script is missing on your branch, add it to package.json accordingly.

Development Workflow & Guardrails

We follow a strict protocol to avoid regressions:

Atomic Edits Only

Small, reversible changes with an explicit file allowlist per task.

Full File Updates (No Patches)

For critical files (index.css, TopChrome.tsx, and any src/components/*.tsx), provide full replacements.

Last Known Good Version

Always branch from or compare to the last tested good commit.

Step-by-Step Instructions (VS Code + PowerShell)

All changes come with where/how to apply, and how to validate (see Testing).

Pre-Change Restore Point

Create a lightweight tag or branch before changes:

git checkout -b chore/restorepoint-YYYYMMDD_HHmm
git commit --allow-empty -m "Restore point before <change-id>"


Acceptance Criteria

UI renders, grid selection persists, indicator updates, Esc clears, no console errors.

Post-Change QA

Run npm run sanity, npm run dev, test in the browser (and Tauri window if applicable).

Rollback If Criteria Fail

git reset --hard <restore-point-commit-or-tag>


Repo Hygiene

Never commit node_modules, build artifacts, or temporary backups. Keep .gitignore current.

Building a Release

Frontend only build

npm run build


Outputs to dist/ (Vite).

Tauri desktop build (Windows)

# Ensure Rust & build tools are installed
npm run tauri build


Produces a Windows executable/installer under src-tauri/target/release (exact path may vary per Tauri version).

Testing & Sanity Checks

Local sanity checklist

npm run sanity


Typical validations (subject to evolve):

Tailwind builds without errors (index.css intact)

Grid renders and selections persist

Numeric selection indicator updates on mouse selection

Esc clears current selection

Dev console shows no errors

Run the app

npm run dev
# Visit http://localhost:5173

Troubleshooting

No windows appear / Tauri fails to launch
Ensure Rust toolchain and Visual C++ build tools are installed. Try:

rustup update
cargo --version


Tailwind styles not applied
Verify src/styles/index.css is imported by main.tsx or App.tsx. Confirm Tailwind v4 config exists and paths are correct.

Grid selection not visible
Confirm CSS layers for selection/highlight are present and no z-index conflicts.

npm run dev starts but UI is broken
Clear caches, reinstall, and retry:

rm -Recurse -Force node_modules
npm install
npm run dev


Build errors on Windows
Open “Developer Command Prompt for VS” once, or ensure MSVC Build Tools installed. Reboot after installing new build tools.

Contributing

Fork & clone the repo

Create a feature branch:

git checkout -b feat/<short-feature-name>


Make atomic changes; update complete files for critical components

Run sanity & dev, validate acceptance criteria

Commit with clear message:

git add -A
git commit -m "feat(grid): persistent selection & Esc clear"


Push & open a Pull Request

We welcome issues for bugs, UX concerns, and enhancement proposals. Please include screenshots and exact repro steps when possible.

Changelog

Maintain a simple, append-only CHANGELOG.md with entries like:

## YYYY-MM-DD
- [ID: A-003] Grid selection persists; Esc clears selection; indicator updates
- [ID: A-002] Restored bottom menu; normalized header spacing
- [ID: A-001] Project bootstrap (Tauri + React + Tailwind v4 + Vite)


IDs map to atomic change batches described in PRs.

License

MIT License — see LICENSE file.
You’re free to use, modify, and distribute with attribution and license notice.

FAQ

Q: Which file should I point to when assigning a program to a grid cell?
A: Use the program’s .exe path (avoid shortcuts), e.g., C:\Program Files\Notepad++\notepad++.exe.

Q: Does this support multiple monitors?
A: The UI is monitor-agnostic; tiling logic targets Windows windows. Multi-monitor placement rules will be iterated during Phase A/B.

Q: Why Tauri instead of Electron?
A: Smaller footprint, Rust backend access, and modern DX with Vite/React/Tailwind.

Q: Where do I change the header/controls?
A: src/components/TopChrome.tsx (critical). For global styles, update src/styles/index.css (critical).

Maintainer Notes (for this repo)

Always tailor instructions to Windows PowerShell and perform edits in VS Code.

Prefer complete file replacements for critical files.

After each successful block:

npm run sanity → npm run dev → manual QA → commit & push.

Tag “restore points” before risky edits.

© FcXe Studios — InstaDesk
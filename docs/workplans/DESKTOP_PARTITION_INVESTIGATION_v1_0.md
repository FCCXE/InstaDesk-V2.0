# DESKTOP PARTITION — Feature Handout (Investigation → Build Seed) v1.0

**Created:** 2026-09-09 · **Author:** a non-InstaDesk session, from live measurement of this workstation
**Status:** SEED. Nothing has been built, committed, tagged or pushed. No `.cs`, `.rs` or `.ts` file was touched.
**Purpose:** hand the InstaDesk lane a feasibility-complete, measurement-backed starting point so it does not re-derive anything.

---

## 0. READ FIRST — this handout does NOT replace the lane's law

⛔ Before acting on anything below, read **IN FULL**:
`C:\FcXe Studios\Instadesk\instadesk-tauri\docs\SESSION_RESUMPTION.md`

That handbook is the working method of record (gates, Sandbox gate, the WinAgent `--dev` agent-path trap, two-repo release procedure, rollback discipline). This file is a *feature seed*, not a method. Where the two differ, the handbook wins.

⚠ The hub records **"NO ACTIVE FRONT"** as of v0.5.2 (2026-08-27), and also records that the FCLX Platform & Delivery Master Plan and the resumption brief **differ on sequencing**. **Confirm with the operator that Desktop Partition is the front before starting.**

---

## 1. THE ASK (operator, 2026-09-09)

> "A Desktop visual partition to help me organize my desktop icons. Group desktop icons by icons and by folders, having my folders sit at one side of the desktop view, while the icons sit on the opposite side, and be able to organize them neatly."

Assessed as feasible and routed into InstaDesk by the operator's own ruling, on the reasoning that InstaDesk already owns the WinAgent Win32 sidecar, multi-monitor topology, and the signed-release delivery path.

---

## 2. MEASURED STATE OF THE WORKSTATION — provenance included

All values below were **measured on 2026-09-09**, not assumed. Re-verify before relying on any of them; window handles in particular are valid only for one Explorer lifetime.

```
Desktop icon control : SysListView32  0x10240
   parent            : SHELLDLL_DefView 0x1023E   inside   Progman 0x1023C
   owner             : explorer.exe  PID 15080, session 1, SESSIONNAME=Console  (NOT RDP)
   LVM_GETITEMCOUNT  : 65

FFlags @ HKCU\Software\Microsoft\Windows\Shell\Bags\1\Desktop = 0x40200224
   FWF_AUTOARRANGE (0x1) = OFF    <- free placement is PERMITTED. This is the precondition.
   FWF_SNAPTOGRID  (0x4) = ON     <- icons snap to the desktop grid
   FWF_DESKTOP    (0x20) = ON

ItemPos* values anywhere under HKCU\...\Shell\Bags : NONE FOUND

Displays (4) — virtual desktop 6200 x 2688 LOGICAL at 125% scaling
   DISPLAY1  0,0        2048x864   PRIMARY
   DISPLAY2  2560,0     2048x864
   DISPLAY3  1811,-768  1093x614   <- NEGATIVE Y
   DISPLAY4  5120,0     1080x1920  <- PORTRAIT

Wallpaper layer present: WorkerW 0x1126A (owns a SHELLDLL_DefView, no ListView) + sibling WorkerW 0x1126E
```

**The 65 reconciles exactly** — this is the corroboration that the control found is the real desktop and not a decoy. The categories SUM:

| Bucket | Count |
|---|---:|
| Real folders in `C:\Users\FABIAN C\Desktop` | 12 |
| `.lnk` shortcuts, user desktop | 14 |
| `.lnk` shortcuts, `C:\Users\Public\Desktop` | 15 |
| Other files, user desktop (incl. `desktop.ini`, two `~$` lock files) | 21 |
| `desktop.ini`, public desktop | 1 |
| Shell items with no filesystem entry: Recycle Bin, "Learn about this picture" | 2 |
| **TOTAL** | **65** |

⚠ **A first probe of this same machine reported NO ListView at all.** It was wrong (malformed `FindWindowEx` call). The reading above is the reproduced one and is the one corroborated by the sum. Recorded because this failure arrived in the *discouraging* direction and could as easily have arrived in the reassuring one.

---

## 3. VERIFIED HOOK POINTS IN THIS REPO

Verified by inspection on 2026-09-09.

| Fact | Value |
|---|---|
| Outer repo | `C:\FcXe Studios\Instadesk` → `FCCXE/FcXe-Studios---InstaDesk`, `main` @ `1dae9ed` |
| Inner repo | `C:\FcXe Studios\Instadesk\instadesk-tauri` → `FCCXE/InstaDesk-V2.0`, `main` @ `3fe8253` |
| WinAgent source | `C:\FcXe Studios\Instadesk\winagent\InstaDesk.WinAgent\Program.cs` (3067 lines) |
| Project file | `winagent\InstaDesk.WinAgent\InstaDesk.WinAgent.csproj` |
| Standalone-verb pattern to copy | `Program.cs` ~lines 320–375 (`--list-monitors`, `--capture-layout`, `--close-all`) |
| Bundled agent the dev sandbox actually runs | `instadesk-tauri\src-tauri\binaries\InstaDesk.WinAgent.exe` |

**Existing P/Invoke surface in the WinAgent** (so you know what is already there):
`EnumWindows, EnumDisplayMonitors, GetWindowRect, GetWindowThreadProcessId, GetDpiForWindow, SetProcessDpiAwarenessContext, SetWindowPos, MoveWindow, DeferWindowPos, DwmGetWindowAttribute, OpenProcess, OpenProcessToken, CloseHandle, ShowWindow, IsWindowVisible, IsIconic, GetMenu, SetForegroundWindow, GetAsyncKeyState, DwmFlush`

**Absent — this is all new surface:** `FindWindowEx`, `SendMessage` / `SendMessageTimeout`, `VirtualAllocEx`, `WriteProcessMemory`, `ReadProcessMemory`, `SetParent`, and any `SysListView32` / `Progman` / `WorkerW` / `LVM_*` handling. Note `OpenProcess` is currently imported but used **only** with `PROCESS_QUERY_LIMITED_INFORMATION`; this feature needs `PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE`.

---

## 4. FEASIBILITY VERDICT

**Buildable. No blocked capability.** Three separable pieces:

1. **Read and write icon positions** — `LVM_GETITEMCOUNT` / `LVM_GETITEMTEXT` / `LVM_GETITEMPOSITION` / `LVM_SETITEMPOSITION` sent to the `SysListView32`. Because the control lives in `explorer.exe`, every struct and text buffer must be allocated **inside explorer**: `OpenProcess` → `VirtualAllocEx` → `WriteProcessMemory` → `SendMessage` → `ReadProcessMemory` → `VirtualFreeEx`. Standard, long-established technique (DesktopOK and every icon-layout saver use it). `FWF_AUTOARRANGE` is measured **off**, which is the precondition.

2. **Classify folder vs. not** — read each item's display name, match against the union of `C:\Users\FABIAN C\Desktop` and `C:\Users\Public\Desktop`, test the directory attribute. Needs a third bucket for shell items with no file at all (Recycle Bin, "Learn about this picture").

3. **Draw the partition panels** — render *behind* the icons by forcing Explorer to spawn its wallpaper `WorkerW` (`SendMessageTimeout(Progman, 0x052C, 0, 0)`) and `SetParent`-ing a borderless layered window into it. The paired WorkerW structure this needs is already present on this machine (0x1126A / 0x1126E). The payoff is that **the icons stay native Explorer icons** — drag, right-click, rename and double-click all keep working, because nothing is replaced, only repainted underneath and repositioned.

---

## 5. THE OBSTACLES — all measured, none speculative

1. ⛔ **Icon positions are NOT persisted to disk by Windows.** Zero `ItemPos*` values exist under `Shell\Bags`. Explorer holds the layout in memory and flushes at logoff. So an Explorer restart, a resolution change, a monitor unplug or a DPI change scrambles the arrangement, and you **cannot** pre-write the answer into the registry to prevent it.
   → **The feature is a resident re-apply service, not a "tidy once" button.** It must watch `WM_DISPLAYCHANGE`, `WM_DPICHANGED` and the `TaskbarCreated` broadcast and re-apply the saved layout. This is the single largest engineering requirement and it defines the product.

2. ✅ **DPI — the trap is real but the WinAgent is already immune.** `winagent\InstaDesk.WinAgent\app.manifest` already declares `<dpiAware>true/pm</dpiAware>` and `<dpiAwareness>PerMonitorV2</dpiAwareness>`. Keep all coordinate work **inside the WinAgent**.
   ⚠ Evidence this matters: a DPI-**un**aware PowerShell probe on this machine read the desktop as `4960x2150` when it is really `6200x2688` — every number off by exactly 25%, and every number entirely plausible. Any *new* helper process, script or window created for this feature must declare the same awareness or it will be silently and consistently wrong.

3. ⚠ **Four monitors in ONE coordinate space.** The ListView is a single coordinate system spanning the whole virtual desktop, origin at the top-left of the **bounding box**, not of the primary display. With DISPLAY3 at negative Y and DISPLAY4 in portrait, "folders right / icons left" must be defined per-monitor and then projected into that one space.

4. ⚠ **Snap-to-grid is ON.** Icons settle on grid cells. Good for the requested neatness, but zone boundaries must be grid-aligned or icons land a few pixels off the drawn edge. Recommend keeping snap **on** and making zones grid-aware rather than turning it off.

5. ⚠ **Writing into `explorer.exe` looks like injection to AV/EDR.** Fine locally; expect false positives once shipped. Relevant to the code-signing / SmartScreen workstream.

**Genuinely impossible:** making Explorer hold two different sort orders at once (folders sorted one way, files another). Explorer has exactly one sort. Zones plus free placement is the way around it — which is what was asked for anyway.

---

## 6. REPO-SPECIFIC TRAPS FOR THIS FEATURE

1. ⛔ **`EnableDefaultItems` is `false` in the csproj.** Every source file is listed explicitly in `<ItemGroup><Compile Include="..."/></ItemGroup>`. **A new `.cs` file will simply not compile in** until it is added there. The symptom is a "missing method" error that reads like a typo.
2. ⛔ **`--capture-layout` is already taken** — it means *window* layout. Do not overload it. Use a distinct namespace: `--desktop-scan`, `--desktop-apply`, `--desktop-restore`, `--desktop-watch`.
3. ⛔ **Do not cache the ListView HWND.** `0x10240` is valid only for this Explorer lifetime. Resolve by class every time: `Progman` → `SHELLDLL_DefView` → `SysListView32`, and **fall back to scanning `WorkerW` windows**, because with a wallpaper slideshow the DefView lives under a `WorkerW` instead of under `Progman`. Both shapes exist on this machine right now.
4. ⚠ **Testing a WinAgent change via `--dev` runs the BUNDLED agent** (`src-tauri\binaries\InstaDesk.WinAgent.exe`), not `publish\sidecar\`. Run `node src-tauri/scripts/build-agent.mjs` first, or you will debug the old binary. The comment in `backend.rs` claiming otherwise is wrong.
5. ⚠ **`OutputType` is `WinExe`, not `Exe`.** stdout JSON works only because the Rust parent redirects it. Keep the new verbs on the same stdout-JSON contract as `--list-monitors`.
6. ⚠ **Backend errors are CODED, not prose.** Rust emits a code, the UI translates. New failure modes need new codes plus their translations, or the UI shows nothing useful.
7. ⛔ **`SendMessageTimeout(Progman, 0x052C, …)` has a real side effect** — it changes Explorer's window structure. It was deliberately **NOT** executed during this investigation. It belongs in a build behind the Sandbox gate, never in a diagnostic.

---

## 7. PROPOSED BUILD SEQUENCE

Each increment ships with its own UI surface where it has one. Increment 0 has no user-facing capability and therefore no screen.

**Increment 0 — DRY RUN, read-only. `--desktop-scan`.**
Enumerate the ListView; emit JSON: index, display name, current position, classification (`folder` | `folder-shortcut` | `app-shortcut` | `file` | `shell-virtual`), and which monitor the position falls on. Writes nothing.
**Accept it only after BOTH controls:**
- *Positive:* move one icon by hand, re-run, confirm the reported position changed by the expected delta.
- *Negative:* point it at a bogus or closed HWND and confirm it fails **loudly**, not silently-empty.

An empty result must distinguish "the desktop genuinely has no icons" from "could not read the desktop". These have different remedies and must not share a representation.

**Increment 1 — `--desktop-restore` BEFORE `--desktop-apply`.**
Build and prove the *undo* first: capture all 65 positions to a JSON file, scramble by hand, restore, confirm byte-identical. Only then write `--desktop-apply`. Shipping apply-before-undo means the first bad run costs the operator their desktop with no way back.

**Increment 2 — zone engine plus the InstaDesk screen.**
Per-monitor zone definitions (left/right split as the default preset), grid-aware packing, and the UI to draw and name the zones. This is where the operator's actual request is satisfied.

**Increment 3 — the resident re-apply watcher.**
`WM_DISPLAYCHANGE` / `WM_DPICHANGED` / `TaskbarCreated` → re-apply. Without this the feature does not survive a single Explorer restart. Treat it as part of the minimum shippable product, not a nicety.

**Increment 4 — the visual panels.**
WorkerW re-parenting; panels painted behind native icons. Cosmetic layer, deliberately last: everything above is useful without it, and it is the only piece that mutates Explorer's window tree.

---

## 8. GATES THAT APPLY (from the hub — verify against `SESSION_RESUMPTION.md`)

- **Rollback tag first**, in BOTH repos: `pre-desktop-partition-20260909`, pushed. This is agent C# work plus a new state model — squarely "substantial".
- **Commit → same-turn push**, both repos. No force-push, no `--no-verify`.
- **`npm run build` is the real gate** for any UI change; `tsc --noEmit` is a no-op here.
- **`prebuild` runs NINE gates plus the vitest suite (64 tests).** A release cannot exist if one fails.
- **The Sandbox gate is UNCONDITIONAL** — no promotion without a local robot-free Sandbox build passing.
- **Ship only via a published signed release** (version bump → signed build → `make-latest-json.mjs` → `gh release create` → verify via `gh api`, **never `curl`**; the CDN is stale).
- **English only.**
- ⛔ **NEVER `Stop-Process -Name Code`**, and **never smoke-test on `Code.exe`** — VS Code hosts the Claude Code session, so killing it self-terminates the session. Use Notepad, Chrome or Edge.
- ⛔ **No fixture may name `Code.exe`** in either Sandbox data dir (`%APPDATA%\...instadesk.sandbox\`, and the dev fallback `<outer repo>\data\`). Both have been found dirty before.

---

## 9. OPEN DECISIONS — THE OPERATOR OWNS THESE

1. **Do folder-shortcuts count as folders?** `FcXe Drive.lnk`, `FCLX Drive.lnk` and `FCLX Drive Sandbox.lnk` are files on disk but folders in the operator's head.
   **Current default (unruled): leave them with the apps**, because that is where they sit on the desktop today. Ask before changing it.
2. **Is Desktop Partition the active front?** The hub records no active front, but also records that the Platform Master Plan and the resumption brief disagree on sequencing. Confirm before opening it.
3. **Is Increment 3 (the watcher) in the first shipped version, or a follow-up release?** Recommendation: in the first version, because without it the feature visibly fails the first time Explorer restarts.

---

## 10. WHAT WAS NOT DONE

No code was written. No file in this repo was modified other than the creation of this document. Nothing was committed, tagged or pushed. `SendMessageTimeout(Progman, 0x052C, …)` was **not** sent. No icon was moved. The workstation was only read.

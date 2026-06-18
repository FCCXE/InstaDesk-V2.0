# Changelog

All notable changes to **InstaDesk** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While pre-1.0 (`0.MINOR.PATCH`): a new feature bumps **MINOR**, a fix or docs-only
change bumps **PATCH**. Each released version below corresponds to a signed GitHub
Release and a `vX.Y.Z` tag. See `docs/RELEASING.md` for the release procedure.

## [Unreleased]

## [0.1.28] - 2026-06-18
### Changed
- User manual fully illustrated: refreshed the dashboard and Settings screenshots to the current light theme + FCLX Studios branding, and added the drag-to-snap and monitor-identify illustrations. Documents the Minimize all / Restore all button. (Documentation only — ships the updated bundled PDF manuals, EN + ES.)

## [0.1.27] - 2026-06-17
### Changed
- Documented the Minimize all / Restore all Snap-bar button and added the Capture-review screenshot; refreshed the bundled PDF manuals (EN + ES). (Documentation only.)

## [0.1.26] - 2026-06-17
### Changed
- The Snap-bar second action is now **Restore all** (returns every window to the exact frame it was in) instead of full-screen maximizing — e.g. a window in the left half of monitor 2 returns to that half. Elevated apps (e.g. iVMS-4200) are still skipped.

## [0.1.25] - 2026-06-17
### Fixed
- Maximize all did nothing because it ran while every window was minimized, and minimized windows were filtered out of the scan (their off-screen size failed an internal check). The scan now includes minimized windows.

## [0.1.24] - 2026-06-17
### Added
- **Minimize all / Maximize all** button in the Snap bar — a dependable replacement for Windows' Show Desktop. Acts on your real windows explicitly. Apps run as administrator (e.g. iVMS-4200) can't be controlled by a normal app and are skipped; the button reports how many it skipped.

## [0.1.23] - 2026-06-17
### Fixed
- Drag-to-snap responsiveness: removed the multi-second busy/"refresh" period after each snap (a flat settle wait an already-open window doesn't need). A snap now finishes as soon as the window is in place (~0.8s), so several windows can be snapped in a row reliably.

## [0.1.22] - 2026-06-17
### Fixed
- Drag-to-snap reliability: the window only snapped if Shift was still held at the exact drop instant, so releasing Shift a hair early silently skipped the snap (felt intermittent). The snap intent is now latched the moment you start dragging with Shift, and the preview stays visible for the whole drag.

## [0.1.21] - 2026-06-17
### Fixed
- Drag-to-snap zone highlight now lines up exactly with where the window lands on every monitor, including mixed-scaling setups (e.g. a 100% screen next to 125% screens). Definitive fix (supersedes 0.1.20).

## [0.1.20] - 2026-06-17
### Fixed
- Drag-to-snap zone highlight was drawn too large/offset on 125%-scaled monitors while the window still snapped correctly. (Partial fix — superseded by 0.1.21.)

## [0.1.19] - 2026-06-17
### Changed
- User manual (EN + ES) expanded to cover Layout capture, Snap & drag-to-snap, global hotkeys, Identify monitors, the expanded Settings, and the signed auto-updater, plus FCLX Studios branding. (Documentation only.)

## [0.1.18] - 2026-06-17
### Changed
- Rebrand to **FCLX Studios** — official header logo (light + dark) and wordmark. Internal app identifiers are unchanged, so existing settings, layouts, and data are preserved.

## [0.1.17] - 2026-06-17
### Added
- Internal foundation of the licensing/trial layer (trial tracking, activation, locked-state gating). **Dormant by default — no user-facing change** until commercial launch.

## [0.1.16] - 2026-06-16
### Fixed
- Captured multi-URL browser windows could still merge into an already-open browser if the Layout was captured before 0.1.15. The new-window flag is now forced when *applying* any browser window, covering older captures with no re-capture needed.

## [0.1.15] - 2026-06-16
### Fixed
- Each captured browser window now opens as its own window (URLs as tabs) instead of merging into an already-open browser. Capture now adds the browser's new-window flag.

## [0.1.14] - 2026-06-16
### Fixed
- Auto-capture now identifies apps that run as administrator (e.g. iVMS-4200) by reading their executable path across the elevation boundary. (Pure Store/UWP apps remain the only rare exception.)

## [0.1.13] - 2026-06-16
### Added
- **Auto-capture Layouts** — a "Capture current layout" button reads where your windows sit and turns them into a Layout. A per-monitor review screen lets you include/exclude windows, attach URLs to browser windows, name it, and save. Captured Layouts are normal, fully-editable Layouts.

## [0.1.12] - 2026-06-16
### Added
- **Identify monitors** button (below the Display Array) flashes each monitor's number on its physical screen, matching the on-screen tiles to your real displays.

## [0.1.11] - 2026-06-16
### Reverted
- Reverts the 0.1.10 window-opening change, which regressed multi-window presets (slower/disorganized). Restores the previous known-good behavior.

## [0.1.10] - 2026-06-16
### Changed
- Faster window opening — cut the launch helper's per-window idle waits (~45% less overhead in testing). **Reverted in 0.1.11** after a multi-window-preset regression.

## [0.1.9] - 2026-06-15
### Fixed
- Drag-to-snap bottom zone: the target zone is now chosen from the dragged window's center, not the mouse pointer (you grab a window by its title bar, so the pointer never reaches the bottom). Bottom halves/quadrants are now reachable.

## [0.1.8] - 2026-06-15
### Added
- Drag-to-snap live zone preview (a translucent highlight follows your cursor across monitors), and drag-snap now respects the Window margin setting.

## [0.1.7] - 2026-06-15
### Changed
- The real running version is now shown in the header (e.g. "v0.1.7 • Live") and the Help footer, instead of a hardcoded "v0.1". Crash/usage diagnostics are stamped with the version too.

## [0.1.6] - 2026-06-15
### Added
- Automatic update notifications — InstaDesk checks for new versions on its own (~4s after launch and every 6h) and shows a slim, dismissible bar with one-click **Install & restart**. The manual Settings → Updates check remains.

## [0.1.5] - 2026-06-14
### Fixed
- Drag-to-snap: top/bottom snaps now work (full 3×3 zone map — edges = halves incl. top/bottom, corners = quadrants, center = maximize), and snaps land on the correct screen/zone on mixed-DPI setups.

## [0.1.4] - 2026-06-14
### Added
- **Drag-to-snap** (opt-in in Settings → Grid & Snapping): hold Shift while dragging any window and release to snap it to the half or quadrant under the cursor. Works on every monitor via the same pixel-accurate placement as launch tiling.

## [0.1.3] - 2026-06-14
### Fixed
- Dark-theme native dropdowns rendered white (the Quick Preset "Pick a Layout" list and other selects) — now display correctly in dark mode.

## [0.1.2] - 2026-06-14
### Added
- Quick Preset hotkeys (Ctrl+Alt+1–9 apply your Quick Presets) and rebindable Show/Snap shortcuts (Settings → Global shortcuts).

## [0.1.1] - 2026-06-14
### Added
- Global hotkeys: Ctrl+Alt+D shows InstaDesk, Ctrl+Alt+S snaps the active window. First auto-update release.

## [0.1.0] - 2026-06-14
### Added
- First InstaDesk release — establishes the signed auto-update baseline. Windows x64 installer.

[Unreleased]: https://github.com/FCCXE/InstaDesk-V2.0/compare/v0.1.28...HEAD
[0.1.28]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.28
[0.1.27]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.27
[0.1.26]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.26
[0.1.25]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.25
[0.1.24]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.24
[0.1.23]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.23
[0.1.22]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.22
[0.1.21]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.21
[0.1.20]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.20
[0.1.19]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.19
[0.1.18]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.18
[0.1.17]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.17
[0.1.16]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.16
[0.1.15]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.15
[0.1.14]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.14
[0.1.13]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.13
[0.1.12]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.12
[0.1.11]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.11
[0.1.10]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.10
[0.1.9]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.9
[0.1.8]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.8
[0.1.7]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.7
[0.1.6]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.6
[0.1.5]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.5
[0.1.4]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.4
[0.1.3]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.3
[0.1.2]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.2
[0.1.1]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.1
[0.1.0]: https://github.com/FCCXE/InstaDesk-V2.0/releases/tag/v0.1.0

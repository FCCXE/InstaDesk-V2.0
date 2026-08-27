// Walkthrough chapter STRUCTURE. No prose lives here.
//
// I-13 moved every word into the locale files. The reason is not tidiness: the
// parity gate inspects en.json and es.json, so while the prose sat in this file
// it was OUTSIDE the gate's reach — and the largest body of user-facing text in
// the feature was exactly where the gate could not see it. A Spanish user would
// have read English chapters while every button around them was translated, and
// nothing would have reported it.
//
// Text resolves by convention, so a step cannot exist without a key:
//     tour.chapters.<chapterId>.title
//     tour.chapters.<chapterId>.steps.<anchorId>.title
//     tour.chapters.<chapterId>.steps.<anchorId>.body
//
// scripts/check-tour-content.mjs verifies every one of those keys exists, and
// scripts/check-i18n-parity.mjs then guarantees EN and ES agree.
//
// CHAPTER IDS MATCH THE HELP TAB'S SECTION IDS (D-4), so the "Show me" buttons
// map without a translation table that could drift.
import type { TourChapter } from './types'

export const SPINE: TourChapter = {
  id: 'quickStart',
  group: 'essentials',
  steps: [
    { anchor: 'monitor-select' },
    { anchor: 'grid-size-picker' },
    { anchor: 'workspace-grid' },
    { anchor: 'assign-buttons' },
    { anchor: 'layout-new-button' },
    { anchor: 'qp-apply-button', schematic: 'apply' },
  ],
}

const GRID: TourChapter = {
  id: 'grid',
  group: 'essentials',
  steps: [
    { anchor: 'grid-size-picker' },
    { anchor: 'workspace-grid' },
    { anchor: 'grid-status' },
    // Added 2026-08-27. The grid clipboard was fully built and reachable from
    // nowhere until the operator placed this affordance; a capability nobody is
    // told about is not delivered.
    { anchor: 'grid-clipboard' },
    { anchor: 'clear-current-button' },
    { anchor: 'clear-all-grids-button' },
  ],
}

const APPS: TourChapter = {
  id: 'apps',
  group: 'essentials',
  steps: [
    { anchor: 'tab-apps' },
    { anchor: 'apps-subtabs' },
    { anchor: 'assign-buttons' },
    // Discoverability audit G-8/G-9. The `apps` chapter was the thinnest of the
    // nine and stopped exactly one step short of the thing that unlocks two
    // windows of one app — the feature the operator hit as a dead end.
    { anchor: 'apps-launch-args-hint' },
  ],
}

const LAYOUTS: TourChapter = {
  id: 'layouts',
  group: 'building',
  steps: [
    { anchor: 'tab-layouts' },
    // Audit G-1: multi-window apps were taught NOWHERE, in tour or Help, and
    // Capture is the only way to author one.
    { anchor: 'layout-capture-button' },
    { anchor: 'layout-new-button' },
    { anchor: 'layouts-list' },
    { anchor: 'layout-show-content' },
    { anchor: 'layout-card-actions', schematic: 'apply' },
    { anchor: 'layout-import-button' },
  ],
}

const QUICK_PRESETS: TourChapter = {
  id: 'quickPresets',
  group: 'building',
  steps: [
    { anchor: 'quick-presets-section' },
    { anchor: 'qp-manage-button' },
    { anchor: 'qp-dropdown' },
    { anchor: 'qp-apply-button', schematic: 'apply' },
    // Switch mode gets a step but NO schematic. The engine animates a two-state
    // A -> B toggle; a swap is inherently three-state (old in place, old gone,
    // new in place), and squeezing it into two would draw something that is not
    // what the action does. A misleading diagram of the most destructive action
    // in the app is worse than none — the prose carries it instead, and the
    // safety gate still forbids the tour from ever FIRING it.
    { anchor: 'qp-switch-mode' },
  ],
}

const URLS_FAVORITES: TourChapter = {
  id: 'urlsFavorites',
  group: 'building',
  steps: [
    { anchor: 'apps-subtabs' },
    { anchor: 'urls-builder' },
    { anchor: 'urls-add-tab-group' },
    { anchor: 'urls-save' },
    { anchor: 'favorites-add' },
    { anchor: 'favorites-row-actions' },
    { anchor: 'favorites-list' },
  ],
}

const SNAP: TourChapter = {
  id: 'snap',
  group: 'daily',
  steps: [
    { anchor: 'snap-button', schematic: 'snap' },
    { anchor: 'minimize-all-button', schematic: 'minimize-all' },
    { anchor: 'close-all-button', schematic: 'close-all' },
    { anchor: 'bottom-status' },
  ],
}

const MONITORS_SETTINGS: TourChapter = {
  id: 'monitorsSettings',
  group: 'daily',
  steps: [
    { anchor: 'monitor-select' },
    { anchor: 'display-array' },
    { anchor: 'identify-monitors-button' },
    { anchor: 'settings-default-grid' },
    { anchor: 'settings-window-margin' },
    { anchor: 'settings-theme' },
    { anchor: 'settings-check-updates' },
    // Audit G-4/G-5/G-6: autostart, telemetry opt-out and licence, taught
    // nowhere. One step naming all three, on the settings list itself.
    { anchor: 'settings-list' },
  ],
}

const TROUBLESHOOTING: TourChapter = {
  id: 'troubleshooting',
  group: 'trouble',
  steps: [
    { anchor: 'version-status' },
    { anchor: 'bottom-status' },
    { anchor: 'help-open-manual' },
  ],
}

/** Every chapter the app can run, in menu order. */
export const CHAPTERS: readonly TourChapter[] = [
  SPINE,
  GRID,
  APPS,
  LAYOUTS,
  QUICK_PRESETS,
  URLS_FAVORITES,
  SNAP,
  MONITORS_SETTINGS,
  TROUBLESHOOTING,
]

export const chapterById = (id: string): TourChapter | undefined =>
  CHAPTERS.find((c) => c.id === id)

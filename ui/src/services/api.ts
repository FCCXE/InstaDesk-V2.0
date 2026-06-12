// InstaDesk API client.
// Path-relative-to-inner-repo: ui/src/services/api.ts
//
// Migration (Phase-2 step 2.3, Option B): endpoints are being ported from the
// Python FastAPI server (server/main.py) to native Tauri/Rust commands
// (src-tauri/src/backend.rs). When running inside the Tauri desktop shell we
// route a ported endpoint to its Rust `invoke` command; in the browser web
// preview we keep hitting the Python bridge server over HTTP `fetch`. Both live
// behind this single seam, so components never change. Ported so far: health.
import { invoke } from '@tauri-apps/api/core'

const API_BASE: string =
  (import.meta as any)?.env?.VITE_API_BASE ?? 'http://127.0.0.1:17866'

// Tauri v2 injects `__TAURI_INTERNALS__` on the window. True ⇒ desktop shell.
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export type HealthResponse = {
  ok: boolean
  agentPath: string
  agentExists: boolean
  mode: string
  timeoutSec: number
  cors: string[]
  dataDir: string
}

export type LaunchRequest = {
  program?: string
  url?: string
  title?: string
  args?: string      // extra command-line flags (e.g. "-n", "--new-window")
  singleInstance?: boolean   // tile the existing window if any; skip relaunch
  urls?: string[]    // browser tabs to open in the new window (URL group)
  monitor: number
  grid: string       // "x,y,w,h" 1-based
  gridSize: string   // "colsxrows"
  noMove?: boolean
  noDpi?: boolean
  frameMode?: 'normal' | 'frameless'
  activate?: boolean
  topmost?: boolean
  waitReadyMs?: number
  marginPx?: number  // window margin (bezel-aware), passed as --cell-margin-px
}

export type LaunchResponse = {
  exitCode: number
  stdout: string
  stderr: string
  cmd: string
}

export type Assignment = {
  type?: 'program' | 'url'
  program?: string
  url?: string
  title?: string
  args?: string
  singleInstance?: boolean
  urls?: string[]
  monitor: number
  grid: string
  gridSize: string
  frameMode?: 'normal' | 'frameless'
  activate?: boolean
  topmost?: boolean
  waitReadyMs?: number
}

export type PresetKind = 'general' | 'single'

export type PresetListItem = {
  kind: PresetKind
  slot: string
  path: string
  updatedAt: string
}

export type SavedPreset = {
  kind: PresetKind
  slot: string
  assignments: Assignment[]
}

export type BrowseEntry = {
  name: string
  isDir: boolean
  isExe: boolean
}

export type BrowseResponse = {
  ok: boolean
  path: string         // "" when listing drive roots
  parent: string | null   // null at drive root or top
  entries: BrowseEntry[]
}

export type ApiMonitor = {
  index: number      // 1-based, matches --monitor on the agent
  primary: boolean
  device: string
  bounds:    { x: number; y: number; w: number; h: number }
  workArea:  { x: number; y: number; w: number; h: number }
}

export type MonitorsResponse = { ok: boolean; monitors: ApiMonitor[] }

// An installed browser detected on the machine (URL Builder "Add Browser").
export type BrowserInfo = { name: string; path: string }

// ---- Quick Presets ---------------------------------------------------------
// A Quick Preset is an ordered bundle of saved Layouts (general/single).
// Apply runs them sequentially on the server (one /presets/run per layout).

export type QuickPresetLayoutRef = {
  kind: PresetKind
  slot: string
}

export type QuickPresetListItem = {
  slot: string
  name: string
  layoutCount: number
  path: string
  updatedAt: string
}

export type SavedQuickPreset = {
  kind: 'quickpreset'
  slot: string
  name: string
  layouts: QuickPresetLayoutRef[]
}

export type QuickPresetRunLayoutResult = {
  kind: PresetKind
  slot: string
  ok: boolean
  error?: string
  results?: LaunchResponse[]
}

export type QuickPresetRunResponse = {
  ok: boolean
  quickpreset: { slot: string; name: string }
  summary: string
  layouts: QuickPresetRunLayoutResult[]
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  base: API_BASE,
  // PORTED to Rust (step 2.3): native command in the desktop shell, HTTP in web.
  health: () =>
    inTauri()
      ? invoke<HealthResponse>('health')
      : request<HealthResponse>('GET', '/health'),
  // PORTED to Rust (step 2.3): agent subprocess (`--list-monitors`) in the shell.
  monitors: () =>
    inTauri()
      ? invoke<MonitorsResponse>('monitors')
      : request<MonitorsResponse>('GET', '/monitors'),
  launch: (req: LaunchRequest) =>
    inTauri()
      ? invoke<LaunchResponse>('launch', { body: req })
      : request<LaunchResponse>('POST', '/launch', req),
  // PORTED to Rust (step 2.3): file/OS endpoints route to native commands in
  // the desktop shell; the web preview keeps HTTP. The agent-invoking *Run /
  // monitors / launch / snapPopup stay on fetch until the agent-batch port.
  browse: (path?: string) =>
    inTauri()
      ? invoke<BrowseResponse>('browse', { path: path ?? '' })
      : request<BrowseResponse>('GET',
          `/browse${path !== undefined && path !== '' ? `?path=${encodeURIComponent(path)}` : ''}`),
  presetsList: () =>
    inTauri()
      ? invoke<{ ok: boolean; presets: PresetListItem[] }>('presets_list')
      : request<{ ok: boolean; presets: PresetListItem[] }>('GET', '/presets/list'),
  presetsGet: (kind: PresetKind, slot: string) =>
    inTauri()
      ? invoke<{ ok: boolean; preset: SavedPreset; path: string }>('presets_get', { kind, slot })
      : request<{ ok: boolean; preset: SavedPreset; path: string }>(
          'GET', `/presets/get?kind=${encodeURIComponent(kind)}&slot=${encodeURIComponent(slot)}`),
  presetsSave: (kind: PresetKind, slot: string, assignments: Assignment[]) =>
    inTauri()
      ? invoke<{ ok: boolean; path: string }>('presets_save', { kind, slot, assignments })
      : request<{ ok: boolean; path: string }>('POST', '/presets/save', { kind, slot, assignments }),
  presetsRun: (kind: PresetKind, slot: string, marginPx?: number) =>
    inTauri()
      ? invoke<{ ok: boolean; results: LaunchResponse[] }>('presets_run', { kind, slot, marginPx })
      : request<{ ok: boolean; results: LaunchResponse[] }>('POST', '/presets/run', { kind, slot, marginPx }),
  presetsDelete: (kind: PresetKind, slot: string) =>
    inTauri()
      ? invoke<{ ok: boolean; deleted: string }>('presets_delete', { kind, slot })
      : request<{ ok: boolean; deleted: string }>('DELETE', '/presets/delete', { kind, slot }),

  // ---- Quick Presets ----
  quickPresetsList: () =>
    inTauri()
      ? invoke<{ ok: boolean; quickpresets: QuickPresetListItem[] }>('quickpresets_list')
      : request<{ ok: boolean; quickpresets: QuickPresetListItem[] }>('GET', '/quickpresets/list'),
  quickPresetsGet: (slot: string) =>
    inTauri()
      ? invoke<{ ok: boolean; quickpreset: SavedQuickPreset; path: string }>('quickpresets_get', { slot })
      : request<{ ok: boolean; quickpreset: SavedQuickPreset; path: string }>(
          'GET', `/quickpresets/get?slot=${encodeURIComponent(slot)}`),
  quickPresetsSave: (slot: string, name: string, layouts: QuickPresetLayoutRef[]) =>
    inTauri()
      ? invoke<{ ok: boolean; path: string; missingLayouts: string[] }>('quickpresets_save', { slot, name, layouts })
      : request<{ ok: boolean; path: string; missingLayouts: string[] }>(
          'POST', '/quickpresets/save', { slot, name, layouts }),
  quickPresetsDelete: (slot: string) =>
    inTauri()
      ? invoke<{ ok: boolean; deleted: string }>('quickpresets_delete', { slot })
      : request<{ ok: boolean; deleted: string }>('DELETE', '/quickpresets/delete', { slot }),
  quickPresetsRun: (slot: string, marginPx?: number) =>
    inTauri()
      ? invoke<QuickPresetRunResponse>('quickpresets_run', { slot, marginPx })
      : request<QuickPresetRunResponse>('POST', '/quickpresets/run', { slot, marginPx }),

  // ---- Quick Snap (Divvy-style ad-hoc) ----
  // Opens a native overlay popup on the target monitor. The agent finds
  // the last-focused non-InstaDesk window, the user drags a rectangle on
  // the popup's grid, and the window snaps. Server request blocks until
  // user commits or cancels — give it a long timeout.
  snapPopup: (monitor: number, gridSize = '6x6', marginPx?: number) =>
    inTauri()
      ? invoke<{
          exitCode: number
          result: {
            ok?: boolean
            cancelled?: boolean
            targetTitle?: string
            monitor?: number
            snapped?: { x: number; y: number; w: number; h: number }
            placementVerified?: boolean
            placementMismatch?: string
            error?: string
          }
          stdout: string
          stderr: string
        }>('snap_popup', { monitor, gridSize, marginPx })
      : request<{
      exitCode: number
      result: {
        ok?: boolean
        cancelled?: boolean
        targetTitle?: string
        monitor?: number
        snapped?: { x: number; y: number; w: number; h: number }
        // True iff the app's final WindowRect matched the requested tile.
        // False when the app moved itself back after our SetWindowPos —
        // e.g. Hikvision iVMS-4200, certain CCTV / video apps with their
        // own placement enforcement.
        placementVerified?: boolean
        placementMismatch?: string
        error?: string
      }
      stdout: string
      stderr: string
    }>('POST', '/snap/popup', { monitor, gridSize, marginPx }),

  // Installed-browser detection. Native (registry) in the desktop shell; in the
  // web preview there's no detection, so return [] (UI falls back to defaults).
  listBrowsers: (): Promise<BrowserInfo[]> =>
    inTauri() ? invoke<BrowserInfo[]>('list_browsers') : Promise.resolve([]),
}

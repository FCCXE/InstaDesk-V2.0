// InstaDesk FastAPI client
// Path-relative-to-inner-repo: ui/src/services/api.ts
// Server contract: see C:\FcXe Studios\Instadesk\server\main.py

const API_BASE: string =
  (import.meta as any)?.env?.VITE_API_BASE ?? 'http://127.0.0.1:17866'

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

export type ApiMonitor = {
  index: number      // 1-based, matches --monitor on the agent
  primary: boolean
  device: string
  bounds:    { x: number; y: number; w: number; h: number }
  workArea:  { x: number; y: number; w: number; h: number }
}

export type MonitorsResponse = { ok: boolean; monitors: ApiMonitor[] }

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
  health: () => request<HealthResponse>('GET', '/health'),
  monitors: () => request<MonitorsResponse>('GET', '/monitors'),
  launch: (req: LaunchRequest) => request<LaunchResponse>('POST', '/launch', req),
  presetsList: () => request<{ ok: boolean; presets: PresetListItem[] }>('GET', '/presets/list'),
  presetsGet: (kind: PresetKind, slot: string) =>
    request<{ ok: boolean; preset: SavedPreset; path: string }>(
      'GET', `/presets/get?kind=${encodeURIComponent(kind)}&slot=${encodeURIComponent(slot)}`),
  presetsSave: (kind: PresetKind, slot: string, assignments: Assignment[]) =>
    request<{ ok: boolean; path: string }>('POST', '/presets/save', { kind, slot, assignments }),
  presetsRun: (kind: PresetKind, slot: string) =>
    request<{ ok: boolean; results: LaunchResponse[] }>('POST', '/presets/run', { kind, slot }),
  presetsDelete: (kind: PresetKind, slot: string) =>
    request<{ ok: boolean; deleted: string }>('DELETE', '/presets/delete', { kind, slot }),
}

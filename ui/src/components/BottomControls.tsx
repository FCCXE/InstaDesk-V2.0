import { useEffect, useMemo, useState } from 'react'
import { useAppState, GRID_COLS, GRID_ROWS } from '../state/AppState'
import { api } from '../services/api'

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'ok'; msg: string }
  | { kind: 'err'; reason: string }

const PRESET_KIND = 'general'
const PRESET_SLOT = 'A'
const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe'

export default function BottomControls() {
  const { selection, currentMonitorId } = useAppState()
  const [action, setAction] = useState<ActionState>({ kind: 'idle' })
  const [slotExists, setSlotExists] = useState<boolean>(false)

  // Map AppState monitor id ('m{N}') back to the agent's 1-based index.
  const monitorIndex = useMemo(() => {
    const n = parseInt(currentMonitorId.replace(/^m/, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : 1
  }, [currentMonitorId])

  // Bounding box of the current selection (1-based x,y,w,h or null when empty)
  const bbox = useMemo(() => {
    if (selection.size === 0) return null
    let rMin = Infinity, rMax = -Infinity, cMin = Infinity, cMax = -Infinity
    selection.forEach((k) => {
      const [rs, cs] = k.split(',')
      const r = parseInt(rs, 10), c = parseInt(cs, 10)
      if (r < rMin) rMin = r; if (r > rMax) rMax = r
      if (c < cMin) cMin = c; if (c > cMax) cMax = c
    })
    return {
      x: cMin + 1, y: rMin + 1,
      w: cMax - cMin + 1, h: rMax - rMin + 1,
    }
  }, [selection])

  // Poll /presets/list to keep the slot-exists indicator current.
  const refreshSlot = async () => {
    try {
      const res = await api.presetsList()
      setSlotExists(res.presets.some(p => p.kind === PRESET_KIND && p.slot.toUpperCase() === PRESET_SLOT))
    } catch {
      setSlotExists(false)
    }
  }
  useEffect(() => {
    refreshSlot()
    const onChanged = () => refreshSlot()
    window.addEventListener('insta:presets-changed', onChanged)
    return () => window.removeEventListener('insta:presets-changed', onChanged)
  }, [])

  const broadcastPresetsChanged = () => {
    window.dispatchEvent(new CustomEvent('insta:presets-changed'))
  }

  const onLaunchNotepad = async () => {
    if (!bbox) return
    setAction({ kind: 'busy', label: 'Launching…' })
    try {
      const res = await api.launch({
        program: NOTEPAD,
        monitor: monitorIndex,
        grid: `${bbox.x},${bbox.y},${bbox.w},${bbox.h}`,
        gridSize: `${GRID_COLS}x${GRID_ROWS}`,
        frameMode: 'frameless',
      })
      if (res.exitCode === 0) {
        setAction({ kind: 'ok', msg: `Launched Notepad on M${monitorIndex} → ${bbox.x},${bbox.y} ${bbox.w}×${bbox.h}` })
      } else {
        setAction({ kind: 'err', reason: `agent exit ${res.exitCode}: ${res.stderr || res.stdout}`.slice(0, 240) })
      }
    } catch (e) {
      setAction({ kind: 'err', reason: (e as Error).message })
    }
  }

  const onSaveLayoutA = async () => {
    if (!bbox) return
    setAction({ kind: 'busy', label: 'Saving Layout A…' })
    try {
      await api.presetsSave(PRESET_KIND, PRESET_SLOT, [{
        type: 'program',
        program: NOTEPAD,
        title: 'Notepad',
        monitor: monitorIndex,
        grid: `${bbox.x},${bbox.y},${bbox.w},${bbox.h}`,
        gridSize: `${GRID_COLS}x${GRID_ROWS}`,
        frameMode: 'frameless',
      }])
      setAction({ kind: 'ok', msg: `Saved Layout A: Notepad on M${monitorIndex} ${bbox.w}×${bbox.h}` })
      broadcastPresetsChanged()
    } catch (e) {
      setAction({ kind: 'err', reason: (e as Error).message })
    }
  }

  const onRunLayoutA = async () => {
    setAction({ kind: 'busy', label: 'Running Layout A…' })
    try {
      const res = await api.presetsRun(PRESET_KIND, PRESET_SLOT)
      const failures = res.results.filter(r => r.exitCode !== 0)
      if (failures.length === 0) {
        setAction({ kind: 'ok', msg: `Ran Layout A • ${res.results.length} window${res.results.length === 1 ? '' : 's'}` })
      } else {
        setAction({ kind: 'err', reason: `${failures.length}/${res.results.length} failed: ${failures[0].stderr || failures[0].stdout}`.slice(0, 240) })
      }
    } catch (e) {
      setAction({ kind: 'err', reason: (e as Error).message })
    }
  }

  const onDeleteLayoutA = async () => {
    setAction({ kind: 'busy', label: 'Deleting Layout A…' })
    try {
      await api.presetsDelete(PRESET_KIND, PRESET_SLOT)
      setAction({ kind: 'ok', msg: 'Deleted Layout A' })
      broadcastPresetsChanged()
    } catch (e) {
      setAction({ kind: 'err', reason: (e as Error).message })
    }
  }

  const status =
    action.kind === 'idle' ? 'Ready • 1280×820' :
    action.kind === 'busy' ? action.label :
    action.kind === 'ok' ? action.msg :
    `Error: ${action.reason}`

  const statusColor =
    action.kind === 'err' ? 'text-red-600' :
    action.kind === 'ok' ? 'text-emerald-600' :
    action.kind === 'busy' ? 'text-blue-600' :
    'text-gray-500'

  const busy = action.kind === 'busy'

  return (
    <div className="mt-4 h-12 border-t border-gray-200 bg-white px-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {['Clear All', 'Copy Grid', 'Fill Grid', 'Snap', 'Spacing'].map((label) => (
          <button
            key={label}
            type="button"
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onLaunchNotepad}
          disabled={!bbox || busy}
          className="ml-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white
                     bg-emerald-600 hover:bg-emerald-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     transition-colors"
          title={bbox
            ? `POST /launch  monitor=${monitorIndex}  grid=${bbox.x},${bbox.y},${bbox.w},${bbox.h}`
            : 'Select cells first'}
        >
          🚀 Launch Notepad
        </button>
        <button
          type="button"
          onClick={onSaveLayoutA}
          disabled={!bbox || busy}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white
                     bg-indigo-600 hover:bg-indigo-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     transition-colors"
          title={bbox
            ? `POST /presets/save  slot=A  monitor=${monitorIndex}  grid=${bbox.x},${bbox.y},${bbox.w},${bbox.h}`
            : 'Select cells first'}
        >
          💾 Save Layout A
        </button>
        <button
          type="button"
          onClick={onRunLayoutA}
          disabled={!slotExists || busy}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white
                     bg-purple-600 hover:bg-purple-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     transition-colors"
          title={slotExists ? 'POST /presets/run  slot=A' : 'Save Layout A first'}
        >
          ▶ Run Layout A
        </button>
        <button
          type="button"
          onClick={onDeleteLayoutA}
          disabled={!slotExists || busy}
          className="px-2 py-1.5 rounded-lg text-sm
                     border border-gray-200 text-gray-500 hover:bg-gray-50
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
          title={slotExists ? 'DELETE /presets/delete  slot=A' : 'No Layout A saved'}
        >
          🗑
        </button>
      </div>
      <div className={`text-xs ${statusColor}`}>
        <span className="mr-3 text-gray-400">
          Layout A: {slotExists ? <span className="text-emerald-600">saved</span> : <span className="text-gray-400">empty</span>}
        </span>
        {status}
      </div>
    </div>
  )
}

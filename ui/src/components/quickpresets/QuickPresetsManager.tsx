import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type PresetListItem,
  type QuickPresetLayoutRef,
  type QuickPresetListItem,
  type SavedQuickPreset,
} from '../../services/api'

type EditMode =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; slot: string; name: string; layouts: QuickPresetLayoutRef[] }

const SLOTS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

function layoutLabel(l: PresetListItem): string {
  return `${l.kind === 'general' ? 'Layout' : 'Single'} ${l.slot}`
}

function dispatchChanged() {
  window.dispatchEvent(new CustomEvent('insta:quickpresets-changed'))
}

export default function QuickPresetsManager({ onClose }: { onClose: () => void }) {
  const [qps, setQps] = useState<QuickPresetListItem[] | null>(null)
  const [layouts, setLayouts] = useState<PresetListItem[] | null>(null)
  const [view, setView] = useState<EditMode>({ mode: 'list' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // --- Form state for create/edit ---
  const [formSlot, setFormSlot] = useState<string>('')
  const [formName, setFormName] = useState<string>('')
  const [formLayouts, setFormLayouts] = useState<QuickPresetLayoutRef[]>([])
  const [pickerSlot, setPickerSlot] = useState<string>('')

  const refresh = useCallback(async () => {
    try {
      const [qpRes, lRes] = await Promise.all([
        api.quickPresetsList(),
        api.presetsList(),
      ])
      setQps(qpRes.quickpresets)
      setLayouts(lRes.presets.filter((p) => p.kind === 'general' && p.slot))
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Close on Esc.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const usedSlots = useMemo(() => new Set((qps ?? []).map((q) => q.slot)), [qps])
  const availableSlotsForCreate = SLOTS.filter((s) => !usedSlots.has(s))

  const startCreate = () => {
    setErr(null); setInfo(null)
    const firstFree = availableSlotsForCreate[0] ?? ''
    setFormSlot(firstFree)
    setFormName('')
    setFormLayouts([])
    setPickerSlot('')
    setView({ mode: 'create' })
  }

  const startEdit = async (slot: string) => {
    setErr(null); setInfo(null); setBusy(true)
    try {
      const res = await api.quickPresetsGet(slot)
      const qp: SavedQuickPreset = res.quickpreset
      setFormSlot(qp.slot)
      setFormName(qp.name)
      setFormLayouts(qp.layouts)
      setPickerSlot('')
      setView({ mode: 'edit', slot: qp.slot, name: qp.name, layouts: qp.layouts })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onSave = async () => {
    setErr(null); setInfo(null)
    if (!formSlot) { setErr('Pick a slot.'); return }
    if (!formName.trim()) { setErr('Give it a name.'); return }
    if (formLayouts.length === 0) { setErr('Add at least one Layout.'); return }
    setBusy(true)
    try {
      const res = await api.quickPresetsSave(formSlot, formName.trim(), formLayouts)
      if (res.missingLayouts.length > 0) {
        setInfo(`Saved with ${res.missingLayouts.length} missing reference(s): ${res.missingLayouts.join(', ')}`)
      } else {
        setInfo('Saved.')
      }
      dispatchChanged()
      await refresh()
      setView({ mode: 'list' })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (slot: string) => {
    if (!window.confirm(`Delete Quick Preset ${slot}? Underlying Layouts are NOT removed.`)) return
    setErr(null); setInfo(null); setBusy(true)
    try {
      await api.quickPresetsDelete(slot)
      dispatchChanged()
      await refresh()
      setInfo(`Quick Preset ${slot} deleted.`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const addLayoutToForm = () => {
    if (!pickerSlot) return
    setFormLayouts((prev) => [...prev, { kind: 'general', slot: pickerSlot }])
    setPickerSlot('')
  }

  const removeLayoutAt = (idx: number) => {
    setFormLayouts((prev) => prev.filter((_, i) => i !== idx))
  }

  const moveLayout = (idx: number, dir: -1 | 1) => {
    setFormLayouts((prev) => {
      const next = prev.slice()
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  const isForm = view.mode === 'create' || view.mode === 'edit'
  const layoutMap = useMemo(() => {
    const m = new Map<string, PresetListItem>()
    ;(layouts ?? []).forEach((l) => m.set(`${l.kind}/${l.slot}`, l))
    return m
  }, [layouts])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-surface p-5 shadow-xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Presets Manager"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <div className="text-base font-semibold text-fg">Quick Presets</div>
            <div className="text-[11px] text-muted">
              Named bundles of Layouts applied with one click.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-raised hover:text-fg"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {err && (
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
            {err}
          </div>
        )}
        {info && !err && (
          <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
            {info}
          </div>
        )}

        {view.mode === 'list' && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] text-muted">
                {qps === null ? 'Loading…' :
                 qps.length === 0 ? 'No Quick Presets yet.' :
                 `${qps.length} Quick Preset${qps.length === 1 ? '' : 's'}`}
              </div>
              <button
                type="button"
                onClick={startCreate}
                disabled={busy || availableSlotsForCreate.length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                title={availableSlotsForCreate.length === 0 ? 'All 26 slots used' : 'Create a new Quick Preset'}
              >
                + New Quick Preset
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
              {(qps ?? []).length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted">
                  Compose your first Quick Preset to bundle multiple Layouts under one Apply button.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {(qps ?? []).map((q) => (
                    <li key={q.slot} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
                          <span aria-hidden className="text-purple-500">⚡</span>
                          <span className="truncate">{q.name}</span>
                          <span className="ml-1 rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted">
                            slot {q.slot}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted">
                          {q.layoutCount} Layout{q.layoutCount === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(q.slot)}
                          disabled={busy}
                          className="rounded-md border border-line px-2 py-1 text-[11px] text-fg hover:bg-raised disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(q.slot)}
                          disabled={busy}
                          className="rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-line bg-raised px-3 py-1.5 text-xs text-fg hover:bg-raised"
              >
                Close
              </button>
            </div>
          </>
        )}

        {isForm && (
          <>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex flex-col">
                <label className="text-[11px] uppercase tracking-wide text-muted">Slot</label>
                {view.mode === 'create' ? (
                  <select
                    value={formSlot}
                    onChange={(e) => setFormSlot(e.target.value)}
                    className="rounded-md border border-line px-2 py-1.5 text-sm"
                  >
                    {availableSlotsForCreate.length === 0 ? (
                      <option value="">(none free)</option>
                    ) : (
                      availableSlotsForCreate.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))
                    )}
                  </select>
                ) : (
                  <div className="rounded-md border border-line bg-raised px-3 py-1.5 text-sm font-mono">
                    {formSlot}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <label className="text-[11px] uppercase tracking-wide text-muted">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Work Day, Trading Mode, Movie Night"
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                  maxLength={80}
                />
              </div>
            </div>

            <div className="mb-2 text-[12px] font-medium text-fg">
              Layouts (applied in order, top → bottom)
            </div>

            <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-line">
              {formLayouts.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted">
                  No Layouts yet. Add one below.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {formLayouts.map((ref, i) => {
                    const exists = layoutMap.has(`${ref.kind}/${ref.slot}`)
                    return (
                      <li key={`${ref.kind}/${ref.slot}/${i}`} className="flex items-center justify-between px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-mono text-muted">
                            #{i + 1}
                          </span>
                          <span className={`truncate text-sm ${exists ? 'text-fg' : 'text-red-600'}`}>
                            {ref.kind === 'general' ? 'Layout' : 'Single'} {ref.slot}
                            {!exists && <span className="ml-1 text-[10px]">(missing)</span>}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveLayout(i, -1)}
                            disabled={i === 0}
                            className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-raised disabled:opacity-30"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLayout(i, 1)}
                            disabled={i === formLayouts.length - 1}
                            className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-raised disabled:opacity-30"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLayoutAt(i)}
                            className="ml-1 rounded-md border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="mb-4 flex items-center gap-2">
              <select
                value={pickerSlot}
                onChange={(e) => setPickerSlot(e.target.value)}
                className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm"
              >
                <option value="">
                  {(layouts ?? []).length === 0 ? 'No Layouts saved yet' : 'Pick a Layout to add…'}
                </option>
                {(layouts ?? []).map((l) => (
                  <option key={`${l.kind}/${l.slot}`} value={l.slot}>
                    {layoutLabel(l)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLayoutToForm}
                disabled={!pickerSlot}
                className="rounded-md bg-raised px-3 py-1.5 text-xs font-semibold text-fg hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Add
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView({ mode: 'list' })}
                disabled={busy}
                className="rounded-md border border-line bg-raised px-3 py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy || !formSlot || !formName.trim() || formLayouts.length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Saving…' : view.mode === 'create' ? 'Create Quick Preset' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

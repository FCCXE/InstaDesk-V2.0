import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

function dispatchChanged() {
  window.dispatchEvent(new CustomEvent('insta:quickpresets-changed'))
}

export default function QuickPresetsManager({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
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
    if (!formSlot) { setErr(t('quickPresets.errPickSlot')); return }
    if (!formName.trim()) { setErr(t('quickPresets.errName')); return }
    if (formLayouts.length === 0) { setErr(t('quickPresets.errAddLayout')); return }
    setBusy(true)
    try {
      const res = await api.quickPresetsSave(formSlot, formName.trim(), formLayouts)
      if (res.missingLayouts.length > 0) {
        setInfo(t('quickPresets.savedMissing', { count: res.missingLayouts.length, refs: res.missingLayouts.join(', ') }))
      } else {
        setInfo(t('quickPresets.saved'))
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
    if (!window.confirm(t('quickPresets.confirmDelete', { slot }))) return
    setErr(null); setInfo(null); setBusy(true)
    try {
      await api.quickPresetsDelete(slot)
      dispatchChanged()
      await refresh()
      setInfo(t('quickPresets.deleted', { slot }))
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
            <div className="text-base font-semibold text-fg">{t('quickPresets.title')}</div>
            <div className="text-[11px] text-muted">
              {t('quickPresets.subtitle')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-raised hover:text-fg"
            title={t('quickPresets.closeEsc')}
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
                {qps === null ? t('browseApp.loading') :
                 qps.length === 0 ? t('quickPresets.noneYet') :
                 t('quickPresets.count', { count: qps.length })}
              </div>
              <button
                type="button"
                onClick={startCreate}
                disabled={busy || availableSlotsForCreate.length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                title={availableSlotsForCreate.length === 0 ? t('quickPresets.newTitleFull') : t('quickPresets.newTitle')}
              >
                {t('quickPresets.newBtn')}
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
              {(qps ?? []).length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted">
                  {t('quickPresets.emptyHelp')}
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
                            {t('layouts.slotBadge', { slot: q.slot })}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted">
                          {t('quickPresets.layoutCount', { count: q.layoutCount })}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(q.slot)}
                          disabled={busy}
                          className="rounded-md border border-line px-2 py-1 text-[11px] text-fg hover:bg-raised disabled:opacity-50"
                        >
                          {t('layouts.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(q.slot)}
                          disabled={busy}
                          className="rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {t('layouts.delete')}
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
                {t('browseApp.close')}
              </button>
            </div>
          </>
        )}

        {isForm && (
          <>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex flex-col">
                <label className="text-[11px] uppercase tracking-wide text-muted">{t('quickPresets.slotLabel')}</label>
                {view.mode === 'create' ? (
                  <select
                    value={formSlot}
                    onChange={(e) => setFormSlot(e.target.value)}
                    className="rounded-md border border-line px-2 py-1.5 text-sm"
                  >
                    {availableSlotsForCreate.length === 0 ? (
                      <option value="">{t('quickPresets.noneFree')}</option>
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
                <label className="text-[11px] uppercase tracking-wide text-muted">{t('quickPresets.nameLabel')}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('quickPresets.namePlaceholder')}
                  className="rounded-md border border-line px-2 py-1.5 text-sm"
                  maxLength={80}
                />
              </div>
            </div>

            <div className="mb-2 text-[12px] font-medium text-fg">
              {t('quickPresets.layoutsHeader')}
            </div>

            <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-line">
              {formLayouts.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-muted">
                  {t('quickPresets.noLayouts')}
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
                            {ref.kind === 'general' ? t('layouts.layout') : t('layouts.single')} {ref.slot}
                            {!exists && <span className="ml-1 text-[10px]">{t('quickPresets.missing')}</span>}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveLayout(i, -1)}
                            disabled={i === 0}
                            className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-raised disabled:opacity-30"
                            title={t('quickPresets.moveUp')}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveLayout(i, 1)}
                            disabled={i === formLayouts.length - 1}
                            className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-raised disabled:opacity-30"
                            title={t('quickPresets.moveDown')}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeLayoutAt(i)}
                            className="ml-1 rounded-md border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                          >
                            {t('quickPresets.remove')}
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
                  {(layouts ?? []).length === 0 ? t('quickPresets.pickNoLayouts') : t('quickPresets.pickLayout')}
                </option>
                {(layouts ?? []).map((l) => (
                  <option key={`${l.kind}/${l.slot}`} value={l.slot}>
                    {`${l.kind === 'general' ? t('layouts.layout') : t('layouts.single')} ${l.slot}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLayoutToForm}
                disabled={!pickerSlot}
                className="rounded-md bg-raised px-3 py-1.5 text-xs font-semibold text-fg hover:bg-line disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('quickPresets.add')}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView({ mode: 'list' })}
                disabled={busy}
                className="rounded-md border border-line bg-raised px-3 py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-50"
              >
                {t('quickPresets.back')}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy || !formSlot || !formName.trim() || formLayouts.length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? t('layouts.saving') : view.mode === 'create' ? t('quickPresets.createBtn') : t('quickPresets.saveChangesBtn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

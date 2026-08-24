// The Guided Tour chooser.
//
// Opened by the accent "Guided Tour" button in the top chrome. Lists every
// chapter with its length, so someone can pick the one topic they came for
// rather than sitting through a linear tour — which is the whole reason the
// content is chaptered (D-2).
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CHAPTERS } from './chapters'
import { chapterTitleKey, type TourChapter } from './types'

export default function TourMenu({
  onPick,
  onClose,
}: {
  onPick: (c: TourChapter) => void
  onClose: () => void
}) {
  const { t } = useTranslation()

  // Esc closes the chooser. It sits ABOVE the tour overlay but is not a
  // ConfirmDialog, so it owns Escape while it is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.guidedTour')}
        className="w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">{t('tour.menuHeading')}</h2>
            <p className="mt-1 text-xs text-muted">{t('tour.menuSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tour.exit')}
            className="shrink-0 rounded-lg border border-line bg-raised px-2 py-1 text-xs text-fg hover:bg-line/60"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto pr-1">
          {CHAPTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised px-3 py-2.5 text-left hover:border-primary/50 hover:bg-line/50"
            >
              <span className="text-sm font-medium text-fg">{t(chapterTitleKey(c.id))}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {t('tour.steps', { count: c.steps.length })}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

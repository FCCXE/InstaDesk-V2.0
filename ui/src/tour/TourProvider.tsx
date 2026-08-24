// The walkthrough engine.
//
// Geometry approach is the one PROVEN in the I-3 spike, not a fresh guess:
// portal to document.body and position purely from getBoundingClientRect(),
// which already returns POST-transform viewport pixels. The app is drawn inside
// a 1280x820 construct that is uniformly scaled to fit the window (App.tsx
// useBalancedFit), so any scale arithmetic here would be wrong twice over.
// Evidence: 698 samples, 696 on-target, 0 mis-tracks, scale 0.6406 -> 1.0000.
//
// Repositioning listens for `scroll` in the CAPTURE phase. There are 15 inner
// scroll containers across 11 components; a bubbling listener on window never
// sees a div scrolling, and the anchor would silently drift.
//
// REQ-1, the always-available exit, is built here rather than added later. Its
// load-bearing rule is R1.3: the exit control is rendered at PROVIDER level and
// NOT inside the step card, so it survives a step whose anchor cannot be
// resolved, whose card is off-screen, or that throws. A broken tour is exactly
// when someone wants out.
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { safeGet, safeSet } from '../services/storage'
import { useAppState, type TourSnapshot } from '../state/AppState'
import { anchorSelector, anchorSpec } from './anchors'
import SchematicAction from './SchematicAction'
import TourMenu from './TourMenu'
import { SPINE } from './chapters'
import { chapterTitleKey, stepBodyKey, stepTitleKey, type AnchorResolution, type TourChapter } from './types'

/** Above the app's modals (z-[80]) and BELOW ConfirmDialog (z-[100]) — a
 *  confirmation must never be obscured by a tutorial. */
const Z_OVERLAY = 90
const Z_CHROME = 91

/** How long an anchor may be missing before it is called lost rather than slow. */
const GRACE_MS = 1200

type TourContextValue = {
  active: boolean
  start: (chapter: TourChapter) => void
  end: () => void
  /** Open the chapter chooser — the "Guided Tour" button's action. */
  openMenu: () => void
}

/**
 * Whether the user has switched the welcome offer OFF.
 *
 * Operator ruling 2026-08-24: the offer appears on EVERY start-up, not once
 * ever, with an explicit opt-out the user controls. That is the better default —
 * "shown once" quietly assumes the first launch is the one where someone wants
 * to learn, which is rarely true; people try an app, come back a week later, and
 * only then want the tour.
 *
 * Deliberately a NEW key rather than reusing `guidedTourSeen`. That key means
 * "has been shown", and reinterpreting a stored value as "has been switched off"
 * would silently suppress the offer for anyone who had already dismissed it —
 * a stale value read with a new meaning.
 *
 * `instadesk:` separator, the majority convention in this app (8 keys to 2) —
 * D-9. Read through safeGet so a storage failure degrades to SHOWING the offer
 * rather than hiding it: an unwanted prompt is recoverable, a help feature
 * nobody can find is not.
 */
const HIDE_OFFER_KEY = 'instadesk:guidedTourHideOffer'

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>')
  return ctx
}

/** Is the pane an anchor is registered against currently open? This is the
 *  question that makes a missing anchor DIAGNOSABLE rather than ambiguous:
 *  pane closed → navigate; pane open and still absent → a real defect. */
function paneIsOpen(
  w: { kind: string; tab?: string; sub?: string },
  mainTab: string,
  appsSubTab: string,
): boolean {
  if (w.kind === 'always') return true
  if (w.kind === 'tab') return mainTab === w.tab
  if (w.kind === 'tab+sub') return mainTab === w.tab && appsSubTab === w.sub
  return false
}

/** A ConfirmDialog is open. Detected structurally rather than by wiring the two
 *  together: ConfirmDialog renders aria-modal="true" at z-[100]. While one is
 *  open, Escape belongs to IT, not to the tour (REQ-1 R1.2). */
function dialogIsOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"]')
}

/* Scroll positions are state the walkthrough moves too: bringing an anchor into
 * view scrolls its container. Captured and restored alongside the AppState
 * snapshot so "changed nothing" holds for what the user can SEE, not merely for
 * what is stored. */
function captureScrollPositions(): Array<[Element, number, number]> {
  const out: Array<[Element, number, number]> = []
  for (const el of Array.from(document.querySelectorAll('*'))) {
    if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
      out.push([el, el.scrollTop, el.scrollLeft])
    }
  }
  return out
}

function restoreScrollPositions(saved: Array<[Element, number, number]>): void {
  for (const [el, top, left] of saved) {
    if (!el.isConnected) continue // the pane was unmounted; nothing to restore
    el.scrollTop = top
    el.scrollLeft = left
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  // Navigation state, lifted in I-7. Reading it is what lets the engine tell
  // "the pane is closed" apart from "the anchor is gone"; writing it is what
  // lets a step open the pane it needs instead of asking the user to.
  const { mainTab, setMainTab, appsSubTab, setAppsSubTab, captureTourSnapshot, restoreTourSnapshot } = useAppState()
  // D-12: whatever the walkthrough moves, it puts back. Captured on start,
  // restored on the single shared teardown path so exit, Escape and normal
  // completion all restore identically (R1.7).
  const snapshot = useRef<TourSnapshot | null>(null)
  const scrolls = useRef<Array<[Element, number, number]>>([])
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  // Offered once, ever. Follows main.tsx's lastSeenVersion shape: record the
  // flag on first sight so the offer cannot reappear on the next start-up.
  const [offerFirstRun, setOfferFirstRun] = useState(false)
  const [hideForever, setHideForever] = useState(false)
  useEffect(() => {
    if (!safeGet<boolean>(HIDE_OFFER_KEY, false)) setOfferFirstRun(true)
  }, [])
  /** Closing the offer only persists anything if the user asked it to. */
  const dismissFirstRun = useCallback(
    (persist: boolean) => {
      if (persist) safeSet(HIDE_OFFER_KEY, true)
      setOfferFirstRun(false)
    },
    [],
  )
  const [chapter, setChapter] = useState<TourChapter | null>(null)
  const [index, setIndex] = useState(0)
  const [resolution, setResolution] = useState<AnchorResolution | null>(null)
  const missingSince = useRef<number | null>(null)

  const active = chapter !== null
  const step = chapter && index < chapter.steps.length ? chapter.steps[index] : null

  /* ------------------------------------------------------------------ *
   * Teardown. ONE path, shared by the exit button, Escape and normal
   * completion (REQ-1 R1.7) so the three cannot diverge and leave residue
   * on only one route.
   * ------------------------------------------------------------------ */
  const end = useCallback(() => {
    // Restore BEFORE clearing, so a chapter that navigated away puts the user
    // back where they were. This is the whole of D-12: "the help changes
    // nothing" is asserted, not promised.
    if (snapshot.current) {
      restoreTourSnapshot(snapshot.current)
      snapshot.current = null
    }
    restoreScrollPositions(scrolls.current)
    scrolls.current = []
    setChapter(null)
    setIndex(0)
    setResolution(null)
    missingSince.current = null
  }, [restoreTourSnapshot])

  const start = useCallback((c: TourChapter) => {
    snapshot.current = captureTourSnapshot()
    scrolls.current = captureScrollPositions()
    setChapter(c)
    setIndex(0)
    setResolution(null)
    missingSince.current = null
  }, [captureTourSnapshot])

  const advance = useCallback(() => {
    setResolution(null)
    missingSince.current = null
    setIndex((i) => {
      const last = chapter ? chapter.steps.length - 1 : 0
      if (i >= last) {
        // Normal completion runs the SAME teardown as the exit button.
        queueMicrotask(end)
        return i
      }
      return i + 1
    })
  }, [chapter, end])

  const back = useCallback(() => {
    setResolution(null)
    missingSince.current = null
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  /* ------------------------------------------------------------------ *
   * Anchor resolution. Every failure mode is named; none is collapsed
   * into a reassuring "not found".
   * ------------------------------------------------------------------ */
  const resolve = useCallback((): AnchorResolution | null => {
    if (!step) return null

    const spec = anchorSpec(step.anchor)
    if (!spec) {
      // The step names an anchor nobody registered. This is a defect in the
      // step, not a timing problem, so it is reported immediately and never
      // waited on.
      return { kind: 'unregistered', anchor: step.anchor }
    }

    const el = document.querySelector(anchorSelector(spec.id))
    if (!el) {
      if (missingSince.current === null) missingSince.current = performance.now()
      const waited = performance.now() - missingSince.current
      // I-7: the current pane is now knowable, so this is adjudicated rather
      // than assumed. If the anchor's pane is NOT open, its absence is expected
      // and the remedy is navigation. If the pane IS open and it is still
      // absent after the grace period, that is a genuine defect and is reported
      // as such - never narrated over.
      if (!paneIsOpen(spec.reachableWhen, mainTab, appsSubTab)) {
        return { kind: 'needs-navigation', spec }
      }
      if (waited < GRACE_MS) return { kind: 'transient', spec }
      return { kind: 'lost', spec }
    }

    missingSince.current = null
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    // Measured in I-3: during a drag-resize the centre can fall outside the
    // viewport for a frame or two. That is a transient to retry, NOT a lost
    // anchor — treating it as loss would log spurious failures exactly when the
    // user resizes mid-tour.
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
      // Carry the element: an anchor scrolled out of view needs an ACTION, not
      // patience, and the effect below performs it. Without this the step waits
      // forever for a condition that cannot change on its own.
      return { kind: 'transient', spec, el }
    }
    return { kind: 'ready', el, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
  }, [step, mainTab, appsSubTab])

  useLayoutEffect(() => {
    if (!active) return
    const update = () => setResolution(resolve())
    update()
    const onScroll = () => update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', onScroll, true) // capture: inner containers
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    const poll = window.setInterval(update, 200)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', onScroll, true)
      ro.disconnect()
      window.clearInterval(poll)
    }
  }, [active, resolve])

  /* ------------------------------------------------------------------ *
   * Navigate to the step's pane. Both actions are in-app, reversible and
   * on no forbidden list; I-8 snapshots them so exiting puts the user back
   * where they were.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!active || !step) return
    const spec = anchorSpec(step.anchor)
    if (!spec) return
    const w = spec.reachableWhen
    if (w.kind === 'tab' && mainTab !== w.tab) setMainTab(w.tab)
    if (w.kind === 'tab+sub') {
      if (mainTab !== w.tab) setMainTab(w.tab)
      if (appsSubTab !== w.sub) setAppsSubTab(w.sub)
    }
  }, [active, step, mainTab, appsSubTab, setMainTab, setAppsSubTab])

  /** Bring a scrolled-away anchor into view. In-app, reversible, on no
   *  forbidden list, and I-8 restores scroll position on exit.
   *
   *  This runs for the TRANSIENT case as well as the ready one. An anchor that
   *  is off-viewport because a pane is scrolled will never resolve on its own,
   *  so scrolling it is the remedy, not a nicety. */
  useEffect(() => {
    if (resolution?.kind === 'ready') {
      resolution.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } else if (resolution?.kind === 'transient' && resolution.el) {
      resolution.el.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, active, resolution?.kind])

  /* ------------------------------------------------------------------ *
   * Escape. Always exits (REQ-1 R1.2) — EXCEPT while a ConfirmDialog is
   * open, where Escape belongs to the dialog.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dialogIsOpen()) return // the dialog's own handler takes it
      e.preventDefault()
      end()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, end])

  const openMenu = useCallback(() => setMenuOpen(true), [])
  const value = useMemo<TourContextValue>(
    () => ({ active, start, end, openMenu }),
    [active, start, end, openMenu],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {menuOpen && (
        <TourMenu
          onClose={() => setMenuOpen(false)}
          onPick={(c) => { setMenuOpen(false); start(c) }}
        />
      )}
      {offerFirstRun && !active && !menuOpen && (
        /* Centred over the app rather than tucked into a corner. A corner toast
           reads as dismissible chrome — easy to ignore, easy to miss entirely.
           Centred on the grid it reads as an invitation that deserves an answer.
           Shown every start-up until the user opts out below. */
        <div className="fixed inset-0 z-[92] grid place-items-center bg-black/35 p-4" role="presentation">
        <div className="w-[400px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-5 shadow-xl">
          <div className="text-base font-semibold text-fg">{t('tour.firstRunTitle')}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('tour.firstRunBody')}</p>
          <label className="mt-4 flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={hideForever}
              onChange={(e) => setHideForever(e.target.checked)}
              className="size-3.5 accent-[var(--color-primary,#0284c7)]"
            />
            {t('tour.dontShowAgain')}
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dismissFirstRun(hideForever)}
              className="rounded-lg border border-line bg-raised px-4 py-2 text-sm font-medium text-fg hover:bg-line/60"
            >
              {t('tour.firstRunDismiss')}
            </button>
            <button
              type="button"
              onClick={() => { dismissFirstRun(hideForever); start(SPINE) }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              {t('tour.firstRunAccept')}
            </button>
          </div>
        </div>
        </div>
      )}
      {active && createPortal(<TourOverlay
        chapter={chapter!}
        index={index}
        resolution={resolution}
        onNext={advance}
        onBack={back}
        onExit={end}
      />, document.body)}
    </TourContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */

function TourOverlay({
  chapter, index, resolution, onNext, onBack, onExit,
}: {
  chapter: TourChapter
  index: number
  resolution: AnchorResolution | null
  onNext: () => void
  onBack: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  const step = chapter.steps[index]
  const rect = resolution?.kind === 'ready' ? resolution.rect : null

  // The card's height is MEASURED, not assumed. A step carrying a schematic is
  // roughly 300px tall against ~190 without one, and a hardcoded estimate put
  // the card on top of the very control it was pointing at whenever the anchor
  // sat low on screen (caught in the I-9 Sandbox review).
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardH, setCardH] = useState(200)
  useLayoutEffect(() => {
    const h = cardRef.current?.getBoundingClientRect().height
    if (h && Math.abs(h - cardH) > 2) setCardH(h)
  })

  // Below the anchor when it genuinely fits, otherwise above it. Never
  // overlapping the anchor, and always inside the viewport. The EXIT depends on
  // none of this (R1.3).
  const CARD_W = 340
  const GAP = 12
  const card = (() => {
    if (!rect) return { left: Math.max(16, window.innerWidth / 2 - CARD_W / 2), top: 120 }
    const below = rect.y + rect.h + GAP
    const above = rect.y - GAP - cardH
    const fitsBelow = below + cardH <= window.innerHeight - 16
    const top = fitsBelow ? below : Math.max(16, above)
    const left = Math.min(Math.max(16, rect.x + rect.w / 2 - CARD_W / 2), window.innerWidth - CARD_W - 16)
    return { left, top }
  })()

  return (
    <>
      {/* Spotlight: one element produces both the dim and the hole. */}
      {rect && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12,
            borderRadius: 10,
            border: '2px solid rgb(56 189 248)',
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.55)',
            pointerEvents: 'none',
            zIndex: Z_OVERLAY,
          }}
        />
      )}
      {/* Dim even when the anchor cannot be resolved, so the tour never looks
          like it silently stopped. */}
      {!rect && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.55)', pointerEvents: 'none', zIndex: Z_OVERLAY }} />
      )}

      {/* -------- PROVIDER-LEVEL EXIT (REQ-1 R1.3) --------------------------
          Rendered independently of the step card and of `resolution`, so it is
          present even when the step is broken. This is the difference between
          "there is an exit button" and "there is always an exit". */}
      <div
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: Z_CHROME,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(15,23,42,0.94)', color: '#e2e8f0',
          border: '1px solid rgba(148,163,184,0.35)', borderRadius: 10,
          padding: '6px 8px 6px 12px', font: '13px/1.3 system-ui, sans-serif',
        }}
      >
        {/* Leads with the feature name so that whichever door someone came
            through — the accent button, a Help-tab "Show me", Settings or the
            first-run offer — the thing that opens NAMES ITSELF as one feature. */}
        <span>{t('tour.guidedTour')} — {t(chapterTitleKey(chapter.id))} · {index + 1}/{chapter.steps.length}</span>
        <button
          type="button"
          onClick={onExit}
          aria-label={t('tour.exit')}
          title={`${t('tour.exit')} (Esc)`}
          style={{
            padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid rgba(148,163,184,0.5)', background: '#1e293b', color: '#e2e8f0',
            font: '600 13px/1.3 system-ui, sans-serif',
          }}
        >
          {t('tour.exit')} ✕
        </button>
      </div>

      {/* -------- Step card ------------------------------------------------ */}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={t(stepTitleKey(chapter.id, step.anchor))}
        style={{
          position: 'fixed', left: card.left, top: card.top, width: CARD_W, zIndex: Z_CHROME,
          background: '#0f172a', color: '#e2e8f0', borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.35)', boxShadow: '0 12px 32px rgba(0,0,0,.45)',
          padding: 14, font: '13px/1.5 system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{t(stepTitleKey(chapter.id, step.anchor))}</div>
        {step.schematic && (
          <div style={{ margin: '8px 0 10px' }}>
            <SchematicAction action={step.schematic} />
          </div>
        )}
        <div style={{ color: '#cbd5e1' }}>{t(stepBodyKey(chapter.id, step.anchor))}</div>

        {resolution && resolution.kind !== 'ready' && (
          <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', fontSize: 12 }}>
            {resolution.kind === 'unregistered' && t('tour.unregistered', { anchor: resolution.anchor })}
            {resolution.kind === 'needs-navigation' && t('tour.waitingForPane', { where: describeWhen(resolution.spec.reachableWhen, t) })}
            {resolution.kind === 'transient' && t('tour.locating')}
            {resolution.kind === 'lost' && t('tour.lost', { anchor: resolution.spec.id })}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onBack} disabled={index === 0} style={btnStyle(index === 0)}>{t('tour.back')}</button>
          <button type="button" onClick={onNext} style={btnStyle(false)}>
            {index === chapter.steps.length - 1 ? t('tour.finish') : t('tour.next')}
          </button>
        </div>
      </div>
    </>
  )
}

function describeWhen(
  w: { kind: string; tab?: string; sub?: string },
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  if (w.kind === 'tab') return t('tour.whereTab', { tab: w.tab })
  if (w.kind === 'tab+sub') return t('tour.whereTabSub', { tab: w.tab, sub: w.sub })
  return ''
}

function btnStyle(disabled: boolean) {
  return {
    padding: '5px 12px', borderRadius: 7,
    border: '1px solid rgba(148,163,184,0.5)',
    background: disabled ? '#1e293b' : '#0284c7',
    color: disabled ? '#64748b' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    font: '600 13px/1.3 system-ui, sans-serif',
  } as const
}

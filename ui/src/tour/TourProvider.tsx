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
import { anchorSelector, anchorSpec } from './anchors'
import type { AnchorResolution, TourChapter } from './types'

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
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>')
  return ctx
}

/** A ConfirmDialog is open. Detected structurally rather than by wiring the two
 *  together: ConfirmDialog renders aria-modal="true" at z-[100]. While one is
 *  open, Escape belongs to IT, not to the tour (REQ-1 R1.2). */
function dialogIsOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"]')
}

export function TourProvider({ children }: { children: ReactNode }) {
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
    setChapter(null)
    setIndex(0)
    setResolution(null)
    missingSince.current = null
  }, [])

  const start = useCallback((c: TourChapter) => {
    setChapter(c)
    setIndex(0)
    setResolution(null)
    missingSince.current = null
  }, [])

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
      // An anchor scoped to a tab may simply be behind a closed pane. Until
      // I-7 lifts the tab state, the engine cannot confirm which pane is open,
      // so it reports needs-navigation rather than claiming the anchor is gone.
      // It never takes the reassuring reading and proceeds regardless.
      if (spec.reachableWhen.kind !== 'always') return { kind: 'needs-navigation', spec }
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
      return { kind: 'transient', spec }
    }
    return { kind: 'ready', el, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
  }, [step])

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

  /** Bring a scrolled-away anchor into view. In-app, reversible, and on no
   *  forbidden list. I-8 snapshots scroll position so this is restored on exit. */
  useEffect(() => {
    if (resolution?.kind === 'ready') {
      resolution.el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    // Only when the step changes, not on every reposition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, active])

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

  const value = useMemo<TourContextValue>(() => ({ active, start, end }), [active, start, end])

  return (
    <TourContext.Provider value={value}>
      {children}
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
  const step = chapter.steps[index]
  const rect = resolution?.kind === 'ready' ? resolution.rect : null

  // Card placement: below the anchor when there is room, otherwise above.
  // Clamped to the viewport so it can never leave the screen — but note the
  // EXIT does not depend on any of this (R1.3).
  const CARD_W = 340
  const card = (() => {
    if (!rect) return { left: Math.max(16, window.innerWidth / 2 - CARD_W / 2), top: 120 }
    const below = rect.y + rect.h + 12
    const top = below + 190 < window.innerHeight ? below : Math.max(16, rect.y - 190)
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
        <span>{chapter.title} · {index + 1}/{chapter.steps.length}</span>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit the walkthrough"
          title="Exit the walkthrough (Esc)"
          style={{
            padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid rgba(148,163,184,0.5)', background: '#1e293b', color: '#e2e8f0',
            font: '600 13px/1.3 system-ui, sans-serif',
          }}
        >
          Exit ✕
        </button>
      </div>

      {/* -------- Step card ------------------------------------------------ */}
      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: 'fixed', left: card.left, top: card.top, width: CARD_W, zIndex: Z_CHROME,
          background: '#0f172a', color: '#e2e8f0', borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.35)', boxShadow: '0 12px 32px rgba(0,0,0,.45)',
          padding: 14, font: '13px/1.5 system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
        <div style={{ color: '#cbd5e1' }}>{step.body}</div>

        {resolution && resolution.kind !== 'ready' && (
          <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', fontSize: 12 }}>
            {resolution.kind === 'unregistered' && <>This step names an unregistered anchor <b>{resolution.anchor}</b> — that is a defect, not a delay.</>}
            {resolution.kind === 'needs-navigation' && <>Waiting for its pane to open ({describeWhen(resolution.spec.reachableWhen)}).</>}
            {resolution.kind === 'transient' && <>Locating…</>}
            {resolution.kind === 'lost' && <>Anchor <b>{resolution.spec.id}</b> could not be found where it is registered. Reporting rather than pointing at nothing.</>}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onBack} disabled={index === 0} style={btnStyle(index === 0)}>Back</button>
          <button type="button" onClick={onNext} style={btnStyle(false)}>
            {index === chapter.steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </>
  )
}

function describeWhen(w: { kind: string; tab?: string; sub?: string }): string {
  if (w.kind === 'tab') return `the ${w.tab} tab`
  if (w.kind === 'tab+sub') return `${w.tab} → ${w.sub}`
  return 'always available'
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

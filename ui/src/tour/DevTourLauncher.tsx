// DEV-ONLY scaffold for the I-6/I-7/I-8 dry runs.
//
// Renders nothing in a production build (`import.meta.env.DEV` is false), so it
// can never reach a user. Replaced by the real entry points in I-12: the Help
// tab's "Show me" buttons, a Settings replay row, and the first-run offer.
//
// The placeholder copy is intentionally NOT in i18n. Real chapter text arrives
// in I-10/I-11 as translated keys; putting throwaway strings through the locale
// files would pollute the parity check with content we intend to delete.
import { useRef, useState } from 'react'
import { useConfirm } from '../components/common/ConfirmDialog'
import { useAppState } from '../state/AppState'
import { useTour } from './TourProvider'
import type { TourChapter } from './types'

const DRY_RUN: TourChapter = {
  id: 'dev-dry-run',
  title: 'Dry run',
  steps: [
    {
      anchor: 'snap-button',
      title: 'This is Snap',
      body: 'Snap grabs the window you last used and drops it into a region you pick. Always-reachable anchor.',
    },
    {
      anchor: 'grid-size-picker',
      title: 'Grid density',
      body: 'Sets how many cells this monitor is divided into. Also an always-reachable anchor.',
    },
    {
      anchor: 'settings-theme',
      title: 'Theme (Settings tab)',
      body: 'This anchor lives behind the Settings tab. Since I-7 the tour OPENS that tab itself rather than asking you to — watch the tab switch as this step begins.',
    },
    {
      // DELIBERATELY BROKEN. The case REQ-1 exists for: the step cannot resolve,
      // so there is no spotlight and no anchor to hang a card on. The exit must
      // still be there, because a broken tour is exactly when someone wants out.
      anchor: 'this-anchor-does-not-exist',
      title: 'Deliberately broken step',
      body: 'This step names an anchor that is not registered. The tour should say so plainly — and the Exit button and Esc must both still work.',
    },
  ],
}

/** All four walled-off actions, each on its real control, so the schematic can
 *  be judged at the card's actual width rather than in isolation. */
const SCHEMATICS: TourChapter = {
  id: 'dev-schematics',
  title: 'Schematics',
  steps: [
    {
      anchor: 'qp-apply-button',
      title: 'Apply a Layout',
      body: 'Every app in the Layout opens and lands in its saved square, across all your monitors. The tour shows it rather than doing it.',
      schematic: 'apply',
    },
    {
      anchor: 'snap-button',
      title: 'Snap',
      body: 'The window you last used jumps into the region you pick.',
      schematic: 'snap',
    },
    {
      anchor: 'minimize-all-button',
      title: 'Minimize all',
      body: 'Every window drops out of the way; press again and each returns to the exact frame it was in.',
      schematic: 'minimize-all',
    },
    {
      anchor: 'close-all-button',
      title: 'Close all windows',
      body: 'Every window is asked to close gracefully — anything with unsaved work still prompts you first.',
      schematic: 'close-all',
    },
  ],
}

/** One step, deliberately behind the Settings tab, so merely STARTING it forces
 *  the engine to navigate. That is what makes the D-12 assertion non-vacuous. */
const SNAPSHOT_PROBE: TourChapter = {
  id: 'dev-snapshot-probe',
  title: 'Snapshot probe',
  steps: [{ anchor: 'settings-theme', title: 'probe', body: 'probe' }],
}

const devBtn = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid #f97316', background: '#c2410c', color: '#fff',
  font: '600 12px/1.2 ui-monospace, Consolas, monospace',
} as const

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function DevTourLauncher() {
  const tour = useTour()
  const app = useAppState()
  const confirm = useConfirm()
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  // Async phases must read the LATEST state, not the values closed over at the
  // moment the test started — otherwise "after" would be a stale copy of
  // "before" and the assertion would pass without proving anything.
  const appRef = useRef(app); appRef.current = app
  const tourRef = useRef(tour); tourRef.current = tour

  /* --------------------------------------------------------------------- *
   * D-12 assertion: capture → let the tour move things → exit → compare.
   *
   * The CONTROL in the middle is the point. Without asserting that the tour
   * actually CHANGED something, a run in which nothing happened would compare
   * equal and be reported as a pass — a check that cannot fail certifies
   * nothing.
   * --------------------------------------------------------------------- */
  const runSnapshotAssertion = async () => {
    if (busy) return
    setBusy(true)
    const log: string[] = []
    const push = (s: string) => { log.push(s); setLines([...log]) }
    try {
      // 1. distinctive starting state
      appRef.current.setMainTab('Apps')
      appRef.current.setAppsSubTab('URLs')
      await wait(250)
      const before = appRef.current.captureTourSnapshot()
      push(`before : tab=${before.mainTab} sub=${before.appsSubTab} selection=${before.selection.length}`)

      // 2. start a chapter whose only step is behind the Settings tab
      tourRef.current.start(SNAPSHOT_PROBE)
      await wait(400)

      // 2b. Also move a field the NAVIGATION never touches. Restoring the tab
      // exercises only one of the seven captured fields; selection and
      // assignments are NOT on the forbidden lists, so a future chapter
      // teaching "put an app in these squares" will legitimately change them.
      // Without this the restore path for those fields ships unexercised.
      appRef.current.toggleCell(0, 0)
      await wait(300)
      const during = appRef.current.captureTourSnapshot()
      push(`during : tab=${during.mainTab} sub=${during.appsSubTab} selection=${during.selection.length}`)

      // 3. CONTROL — the tour must actually have moved something, on BOTH axes
      const movedTab = during.mainTab !== before.mainTab
      const movedSel = during.selection.length !== before.selection.length
      const moved = movedTab && movedSel
      push(moved
        ? '  CONTROL: state changed on both axes (tab + selection) — assertion is meaningful'
        : `  CONTROL FAILED: tab moved=${movedTab} selection moved=${movedSel} — comparison proves nothing`)

      // 4. exit, then compare
      tourRef.current.end()
      await wait(500)
      const after = appRef.current.captureTourSnapshot()
      push(`after  : tab=${after.mainTab} sub=${after.appsSubTab} selection=${after.selection.length}`)

      const same = JSON.stringify(before) === JSON.stringify(after)
      if (!same) {
        for (const k of Object.keys(before) as Array<keyof typeof before>) {
          if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
            push(`  DIFF ${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`)
          }
        }
      }
      push(same && moved
        ? 'VERDICT: PASS — tour moved state and exit restored it exactly'
        : !moved
          ? 'VERDICT: INVALID — control failed, nothing was proven'
          : 'VERDICT: FAIL — state was not restored')
    } catch (e) {
      push(`error: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  if (!import.meta.env.DEV) return null

  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      {lines.length > 0 && (
        <div style={{
          background: 'rgba(15,23,42,0.96)', color: '#e2e8f0', border: '1px solid #f97316',
          borderRadius: 8, padding: '8px 10px', font: '12px/1.45 ui-monospace, Consolas, monospace', maxWidth: 560,
        }}>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.includes('FAIL') || l.includes('INVALID') || l.startsWith('error') ? '#fca5a5' : l.includes('PASS') ? '#86efac' : '#cbd5e1' }}>{l}</div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {!tour.active && (
          <button type="button" onClick={() => tour.start(DRY_RUN)} style={devBtn}>
            ▶ DEV: run tour dry-run
          </button>
        )}
        {!tour.active && (
          <button type="button" onClick={() => tour.start(SCHEMATICS)} style={devBtn}>
            ▶ DEV: preview the 4 schematics
          </button>
        )}
        <button type="button" onClick={runSnapshotAssertion} disabled={busy} style={devBtn}>
          {busy ? 'running…' : '▶ DEV: assert tour changes nothing'}
        </button>
        {/* Proves REQ-1 R1.2's ordering rule safely: while a ConfirmDialog is
            open ON TOP of a running tour, Esc must close the DIALOG and leave
            the tour running. Cancelling does nothing at all. */}
        <button
          type="button"
          onClick={() => { void confirm({ title: 'Esc precedence test', body: 'Press Esc. This dialog should close and the tour should keep running. Nothing happens either way.' }) }}
          style={devBtn}
        >
          ▶ DEV: confirm over tour
        </button>
      </div>
    </div>
  )
}

// DEV-ONLY scaffold. Renders nothing in a production build.
//
// The broken-step dry run was RETIRED at I-13, and not merely because the new
// step type carries no prose. It is now IMPOSSIBLE to ship a step naming an
// unregistered anchor: scripts/check-tour-anchors.mjs fails the build on one.
// A build-time impossibility is strictly stronger than a runtime demonstration,
// so keeping a dev chapter alive — and giving dev-only copy real translation
// keys to satisfy the gates — would have bought nothing.
//
// What remains has no production equivalent: the D-12 "changes nothing"
// assertion, and the REQ-1 R1.2 Escape-precedence probe.
//
// Renders nothing in a production build (`import.meta.env.DEV` is false), so it
// can never reach a user. Replaced by the real entry points in I-12: the Help
// tab's "Show me" buttons, a Settings replay row, and the first-run offer.
//
// The placeholder copy is intentionally NOT in i18n. Real chapter text arrives
// in I-10/I-11 as translated keys; putting throwaway strings through the locale
// files would pollute the parity check with content we intend to delete.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useConfirm } from '../components/common/ConfirmDialog'
import { useAppState } from '../state/AppState'
import { clearTourEvents, readTourEvents, subscribeTourEvents } from './devEventLog'
import { useTour } from './TourProvider'
import type { TourChapter } from './types'

/** One step, deliberately behind the Settings tab, so merely STARTING it forces
 *  the engine to navigate. That is what makes the D-12 assertion non-vacuous. */
const SNAPSHOT_PROBE: TourChapter = {
  // Reuses the real monitorsSettings chapter's id so its text resolves from the
  // locale files like any other chapter — a dev-only id would render raw key
  // paths and, worse, would need dev copy translated into both locales to
  // satisfy the content gate. Only the FIRST step is taken, and the probe exits
  // immediately, so which chapter it borrows is immaterial; what matters is that
  // the step sits behind the Settings tab and therefore forces navigation.
  id: 'monitorsSettings',
  // Required by TourChapter. The probe never appears in the chooser; it borrows
  // monitorsSettings' id, so it borrows its group for consistency.
  group: 'daily',
  steps: [{ anchor: 'settings-theme' }],
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
  // The scaffold must not compete with the thing being judged. It folds away
  // to a small handle, and folds itself away automatically the moment a
  // chapter starts — the handle stays so the Esc-precedence test is still
  // reachable mid-tour.
  // Live mirror of what the walkthrough emits. Telemetry is inert in dev, so
  // without this the event ORDER could only be assumed, never observed.
  const events = useSyncExternalStore(subscribeTourEvents, readTourEvents)
  const [collapsed, setCollapsed] = useState(false)
  const wasActive = useRef(tour.active)
  useEffect(() => {
    if (tour.active && !wasActive.current) setCollapsed(true)
    wasActive.current = tour.active
  }, [tour.active])

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
      const nAssigned = (m: Record<string, Record<string, string | null>>): number =>
        Object.values(m).reduce((n, cells) => n + Object.values(cells).filter(Boolean).length, 0)
      const before = appRef.current.captureTourSnapshot()
      push(`before : tab=${before.mainTab} selection=${before.selection.length} assigned=${nAssigned(before.assignmentsByMonitor)}`)

      // 2. start a chapter whose only step is behind the Settings tab
      tourRef.current.start(SNAPSHOT_PROBE)
      await wait(400)

      // 2b. Also move a field the NAVIGATION never touches. Restoring the tab
      // exercises only one of the seven captured fields; selection and
      // assignments are NOT on the forbidden lists, so a future chapter
      // teaching "put an app in these squares" will legitimately change them.
      // Without this the restore path for those fields ships unexercised.
      appRef.current.toggleCell(0, 0)
      // 2c. And ACTUALLY ASSIGN an app, so assignmentsByMonitor - the field a
      // real user will change during the spine's "put an app in the region"
      // step - is exercised rather than merely captured. Carried obligation
      // from I-8: proving the restore MECHANISM on one field is not proof for
      // the field that will actually move in anger.
      appRef.current.setSelectedApp('Notepad')
      await wait(150)
      appRef.current.assignSelected()
      await wait(300)
      const during = appRef.current.captureTourSnapshot()
      push(`during : tab=${during.mainTab} selection=${during.selection.length} assigned=${nAssigned(during.assignmentsByMonitor)}`)

      // 3. CONTROL — the tour must actually have moved something, on BOTH axes
      const movedTab = during.mainTab !== before.mainTab
      const movedSel = during.selection.length !== before.selection.length
      const movedAssign = nAssigned(during.assignmentsByMonitor) !== nAssigned(before.assignmentsByMonitor)
      const moved = movedTab && movedSel && movedAssign
      push(moved
        ? '  CONTROL: tab + selection + ASSIGNMENTS all changed — assertion is meaningful'
        : `  CONTROL FAILED: tab=${movedTab} selection=${movedSel} assigned=${movedAssign} — proves nothing`)

      // 4. exit, then compare
      tourRef.current.end()
      await wait(500)
      const after = appRef.current.captureTourSnapshot()
      push(`after  : tab=${after.mainTab} selection=${after.selection.length} assigned=${nAssigned(after.assignmentsByMonitor)}`)

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

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Show the DEV scaffold"
        aria-label="Show the DEV scaffold"
        style={{
          position: 'fixed', left: 8, bottom: 8, zIndex: 2147483000,
          width: 22, height: 22, borderRadius: 11, cursor: 'pointer', opacity: 0.45,
          border: '1px solid #f97316', background: '#c2410c', color: '#fff',
          font: '700 11px/1 ui-monospace, Consolas, monospace', padding: 0,
        }}
      >
        ▸
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      {events.length > 0 && (
        <div style={{
          background: 'rgba(15,23,42,0.96)', color: '#e2e8f0', border: '1px solid #38bdf8',
          borderRadius: 8, padding: '8px 10px', font: '11px/1.5 ui-monospace, Consolas, monospace', maxWidth: 560,
        }}>
          <div style={{ color: '#7dd3fc', fontWeight: 700, marginBottom: 4 }}>
            telemetry (dev mirror — nothing is sent without keys)
            <button
              type="button"
              onClick={clearTourEvents}
              style={{ marginLeft: 8, cursor: 'pointer', border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', borderRadius: 5, padding: '0 6px' }}
            >
              clear
            </button>
          </div>
          {events.map((e, i) => (
            <div key={i}>
              <span style={{ color: '#86efac' }}>{e.event}</span>{' '}
              <span style={{ color: '#94a3b8' }}>{JSON.stringify(e.props)}</span>
            </div>
          ))}
        </div>
      )}
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Hide the DEV scaffold"
          style={{ ...devBtn, padding: '6px 9px' }}
        >
          ✕ hide
        </button>
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

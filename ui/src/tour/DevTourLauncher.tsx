// DEV-ONLY scaffold for the I-6 dry run.
//
// Renders nothing in a production build (`import.meta.env.DEV` is false and
// the whole component tree-shakes away), so this can never reach a user. It is
// replaced by the real entry points in I-12: the Help tab's "Show me" buttons,
// a Settings replay row, and the first-run offer.
//
// The placeholder copy below is intentionally NOT in i18n. Real chapter text
// arrives in I-10/I-11 as translated keys; putting throwaway strings through the
// locale files would pollute the parity check with content we intend to delete.
import { useConfirm } from '../components/common/ConfirmDialog'
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
      body: 'This anchor lives behind the Settings tab. With Apps open it must report needs-navigation, not pretend it is missing.',
    },
    {
      // DELIBERATELY BROKEN. This is the case REQ-1 exists for: the step cannot
      // resolve, so there is no spotlight and no anchor to hang a card on. The
      // exit must still be there, because a broken tour is exactly when someone
      // wants out. Dev-only, so it can never reach a user.
      anchor: 'this-anchor-does-not-exist',
      title: 'Deliberately broken step',
      body: 'This step names an anchor that is not registered. The tour should say so plainly — and the Exit button and Esc must both still work.',
    },
  ],
}

const devBtn = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid #f97316', background: '#c2410c', color: '#fff',
  font: '600 12px/1.2 ui-monospace, Consolas, monospace',
} as const

export default function DevTourLauncher() {
  const { start, active } = useTour()
  const confirm = useConfirm()
  if (!import.meta.env.DEV) return null
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2147483000, display: 'flex', gap: 8 }}>
      {!active && (
        <button type="button" onClick={() => start(DRY_RUN)} style={devBtn}>
          ▶ DEV: run tour dry-run
        </button>
      )}
      {/* Proves REQ-1 R1.2's ordering rule safely: while a ConfirmDialog is open
          ON TOP of a running tour, Esc must close the DIALOG and leave the tour
          running. Cancelling this dialog does nothing at all, so the test costs
          the operator nothing. */}
      <button
        type="button"
        onClick={() => { void confirm({ title: 'Esc precedence test', body: 'Press Esc. This dialog should close and the tour should keep running. Nothing happens either way.' }) }}
        style={devBtn}
      >
        ▶ DEV: open a confirm over the tour
      </button>
    </div>
  )
}

import TopChrome from './components/TopChrome'
import MonitorSelector from './components/MonitorSelector'
import WorkspaceGrid from './components/WorkspaceGrid'
import RightPane from './components/RightPane'
import BottomControls from './components/BottomControls'
import LayoutPreviewOverlay from './components/layouts/LayoutPreviewOverlay'

// ✅ central state wrapper
import { AppStateProvider } from './state/AppState'

/**
 * Responsive layout (Phase 3.1, brought forward 2026-06-11).
 *
 * InstaDesk now FILLS its window and reflows to the available space — no fixed
 * canvas, no zoom-scaling. This replaces the prior fixed 1280×820 surface +
 * `useScaleToFit` transform, which could only shrink/zoom a frozen picture and
 * left dead margins on monitors whose aspect ratio differed from the design.
 *
 * How it fills:
 *  - Root is `h-dvh w-full flex flex-col`: TopChrome (auto) → main area
 *    (`flex-1`, fills vertical space) → BottomControls (auto).
 *  - Main area is a 3-column grid; the left/right panes hold sensible widths
 *    and the center column (`minmax(0,1fr)`) absorbs the rest — so a wider
 *    window yields a bigger WorkspaceGrid. `minmax(0,…)` lets the center
 *    shrink instead of overflowing.
 *  - The inner panes already use `flex-1 / min-h-0 / overflow-y-auto`, so they
 *    fill vertically and scroll when space is tight.
 *  - The minimum window size (1024×680, set in tauri.conf.json step 2.2)
 *    guarantees all three columns always fit.
 *
 * Removing the ancestor `transform` also makes `position:fixed` modals/overlays
 * cover the real viewport again (a transform creates a containing block for
 * fixed descendants), which the scaled surface previously broke.
 *
 * Follow-ups (refinement, see master roadmap Phase 3.1): make the center grid
 * mirror the selected monitor's aspect ratio (instead of always square) so it
 * uses the full width on ultrawides; add a narrow-width breakpoint that
 * collapses/stacks the side panes below the min-size floor.
 */
export default function App() {
  return (
    <AppStateProvider>
      <div className="h-dvh w-full overflow-hidden bg-bg flex flex-col">
        {/* Top chrome */}
        <TopChrome />

        {/* Main content: symmetric top/bottom gaps via pt-3 / pb-3 */}
        <div className="flex-1 min-h-0 grid grid-cols-[284px_minmax(0,1fr)_320px] gap-3 px-6 pt-3 pb-3">
          {/* Left column */}
          <div className="min-h-0">
            <MonitorSelector />
          </div>

          {/* Center column (grid). Position relative so the
              LayoutPreviewOverlay can absolute-position over the
              WorkspaceGrid without escaping the column. */}
          <div className="relative min-h-0 overflow-hidden">
            <WorkspaceGrid />
            <LayoutPreviewOverlay />
          </div>

          {/* Right column */}
          <div className="min-h-0">
            <RightPane />
          </div>
        </div>

        {/* Bottom controls row */}
        <div className="px-6 pb-3">
          <BottomControls />
        </div>
      </div>
    </AppStateProvider>
  )
}

import { useEffect, useState } from 'react'
import TopChrome from './components/TopChrome'
import MonitorSelector from './components/MonitorSelector'
import WorkspaceGrid from './components/WorkspaceGrid'
import RightPane from './components/RightPane'
import BottomControls from './components/BottomControls'
import LayoutPreviewOverlay from './components/layouts/LayoutPreviewOverlay'

// ✅ central state wrapper
import { AppStateProvider } from './state/AppState'

/**
 * Option A — "balanced proportion in any configuration" (2026-06-11).
 *
 * Scale the ENTIRE 1280×820 construct as one cohesive unit to fit the window
 * (contain), centered. Every element — panels, grid, text, buttons — keeps its
 * exact designed proportion to every other; only the overall size changes. This
 * is the one behavior that stays perfectly balanced at any window shape (no
 * stretched cells, no element shrinking independently of the others).
 *
 * Trade-off (intentional, operator-approved for assessment): when the window's
 * aspect differs from the construct's (1280:820 ≈ 1.56), there are SYMMETRIC
 * empty margins — side bars on wide/ultrawide windows, top/bottom bars on tall
 * snaps. Balanced, never lopsided.
 *
 * Unlike the earlier capped version (which stayed 1× and floated tiny on big
 * screens), the scale is NOT capped: the construct grows to fill the limiting
 * dimension, so it's large and centered, framed by a subtle ring.
 */
const DESIGN_W = 1280
const DESIGN_H = 820

function useScaleToFit() {
  const compute = () =>
    Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
  const [scale, setScale] = useState(compute)
  useEffect(() => {
    const onResize = () => setScale(compute())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return scale
}

export default function App() {
  const scale = useScaleToFit()
  return (
    <AppStateProvider>
      <div className="h-dvh w-full overflow-hidden bg-bg flex items-center justify-center">
        {/* Fixed 1280×820 construct, uniformly scaled to fit the window (origin
            center). The surrounding flex centers it; overflow-hidden clips the
            scaled-box edges so there are never scrollbars. A subtle ring frames
            the construct against the symmetric margins. */}
        <div
          className="w-[1280px] h-[820px] bg-bg shadow ring-1 ring-black/5 dark:ring-white/10 overflow-hidden flex flex-col"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
        >
          {/* Top chrome */}
          <TopChrome />

          {/* Main content: symmetric top/bottom gaps via pt-3 / pb-3 */}
          <div className="flex-1 min-h-0 grid grid-cols-[284px_1fr_320px] gap-3 px-6 pt-3 pb-3">
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
      </div>
    </AppStateProvider>
  )
}

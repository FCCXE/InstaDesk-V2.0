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
 * Auto-adjust (Phase-1 baseline): scale the fixed 1280×820 dashboard DOWN
 * to fit smaller windows, so InstaDesk is never clipped when it's snapped to
 * a monitor / half-monitor / grid cell. Capped at 1× so it stays at its
 * designed size (centered) on large screens. The commercial responsive
 * layout (panes reflow + a minimum window size) is a Tauri-phase item —
 * see the master roadmap, Phase 3.1.
 */
const DESIGN_W = 1280
const DESIGN_H = 820

function useScaleToFit() {
  const compute = () =>
    Math.min(1, Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H))
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
        {/* Fixed 1280×820 surface, auto-scaled to fit the window (origin
            center; the surrounding flex centers it, overflow-hidden clips
            the empty scaled-box edges so there are no scrollbars). */}
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

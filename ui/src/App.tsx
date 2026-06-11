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
 * Middle term — "balanced AND filled" (2026-06-11).
 *
 * Option A (uniform scale, contain) gave perfect balance but left symmetric
 * empty margins. This keeps the balance and fills the window:
 *
 *  - Scale the construct's CONTENT uniformly by the fit factor
 *    S = min(w/DESIGN_W, h/DESIGN_H) — text, buttons, grid all grow together,
 *    so it stays balanced and readable (the part of Option A you liked).
 *  - But lay the construct out FLUID at (w/S × h/S) px, then scale by S, so it
 *    renders at exactly the window size — NO empty margins. The slack beyond the
 *    1280×820 design is absorbed by the construct itself: the fluid center
 *    column widens (a bigger, honest grid on wide monitors) and the flexible
 *    main row grows (taller panels on tall windows) — i.e. "fill the empty
 *    space with actual construct."
 *
 * The grid clamps its own shape (see WorkspaceGrid) so it never stretches into
 * skinny cells; on shapes that don't match the monitor it falls back to neutral
 * square cells rather than distorting.
 */
const DESIGN_W = 1280
const DESIGN_H = 820

function useFitFill() {
  const get = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const s = Math.min(w / DESIGN_W, h / DESIGN_H)
    return { s, w, h }
  }
  const [v, setV] = useState(get)
  useEffect(() => {
    const onResize = () => setV(get())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return v
}

export default function App() {
  const { s, w, h } = useFitFill()
  return (
    <AppStateProvider>
      <div className="h-dvh w-full overflow-hidden bg-bg">
        {/* Fluid construct sized to (window / S) and scaled by S from the
            top-left, so it fills the window exactly with content uniformly
            scaled (balanced) and no empty margins. */}
        <div
          className="bg-bg overflow-hidden flex flex-col"
          style={{
            width: `${w / s}px`,
            height: `${h / s}px`,
            transform: `scale(${s})`,
            transformOrigin: 'top left',
          }}
        >
          {/* Top chrome */}
          <TopChrome />

          {/* Main content: symmetric top/bottom gaps via pt-3 / pb-3.
              center column minmax(0,1fr) absorbs extra width (a wider grid on
              wide monitors). */}
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
      </div>
    </AppStateProvider>
  )
}

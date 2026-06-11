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
 * Balanced fit (2026-06-11) — "maximize space, but only up to the construct's
 * adequate balance."
 *
 * The construct's VERTICAL proportion is pinned to its design height (820), so
 * it never stretches tall into emptiness (the vertical-stretch the operator
 * flagged). Its WIDTH is fluid: it widens to fill horizontal space — the center
 * grid absorbs the extra — up to a balanced max aspect (MAX_AR). The whole thing
 * is then uniformly scaled to fit the window and centered.
 *
 * Result per window shape:
 *  - Window aspect within [DESIGN_AR, MAX_AR]  → construct fills the window
 *    fully (wider grid, no margins), pinned design height ⇒ panels stay full,
 *    no vertical stretch.
 *  - Taller/narrower than DESIGN_AR            → construct holds design aspect,
 *    fills width, symmetric TOP/BOTTOM margins (the balanced limit).
 *  - Wider than MAX_AR (e.g. 32:9)             → construct holds MAX_AR, fills
 *    height, symmetric SIDE margins (the balanced limit).
 *
 * So it maximizes fill while every margin only appears where filling further
 * would break balance — exactly the operator's spec.
 */
const DESIGN_W = 1280
const DESIGN_H = 820
const DESIGN_AR = DESIGN_W / DESIGN_H // ≈ 1.561 — the construct's natural balance
const MAX_AR = 2.5 // widen up to ultrawide (covers 21:9 ≈ 2.37); beyond → side margins

function useBalancedFit() {
  const get = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    // Construct aspect = window aspect, clamped to the balanced range.
    const targetAR = Math.min(MAX_AR, Math.max(DESIGN_AR, w / h))
    // Height pinned to design; width follows the (clamped) aspect.
    const preH = DESIGN_H
    const preW = targetAR * DESIGN_H
    // Uniformly scale the (preW × preH) construct to fit the window (contain).
    const s = Math.min(w / preW, h / preH)
    return { s, preW, preH }
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
  const { s, preW, preH } = useBalancedFit()
  return (
    <AppStateProvider>
      <div className="h-dvh w-full overflow-hidden bg-bg flex items-center justify-center">
        {/* Construct: design-height-pinned, width-fluid, uniformly scaled +
            centered. Subtle ring frames it against any balanced-limit margins. */}
        <div
          className="shrink-0 bg-bg shadow ring-1 ring-black/5 dark:ring-white/10 overflow-hidden flex flex-col"
          style={{
            width: `${preW}px`,
            height: `${preH}px`,
            transform: `scale(${s})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Top chrome */}
          <TopChrome />

          {/* Main content: symmetric top/bottom gaps via pt-3 / pb-3.
              center column minmax(0,1fr) absorbs the extra width as the
              construct widens (a bigger grid on wide monitors). */}
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

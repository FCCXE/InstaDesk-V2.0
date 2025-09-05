import TopChrome from './components/TopChrome'
import MonitorSelector from './components/MonitorSelector'
import WorkspaceGrid from './components/WorkspaceGrid'
import RightPane from './components/RightPane'
import BottomControls from './components/BottomControls'

export default function App() {
  return (
    <div className="min-h-dvh min-w-full bg-neutral-100 flex items-center justify-center">
      {/* Fixed 1280×820 centered app surface */}
      <div className="w-[1280px] h-[820px] bg-neutral-50 shadow ring-1 ring-black/5 overflow-hidden flex flex-col">
        {/* Top chrome */}
        <TopChrome />

        {/* Main content: symmetric top/bottom gaps via pt-3 / pb-3 */}
        <div className="flex-1 min-h-0 grid grid-cols-[284px_1fr_320px] gap-3 px-6 pt-3 pb-3">
          {/* Left column */}
          <div className="min-h-0">
            <MonitorSelector />
          </div>

          {/* Center column (grid) */}
          <div className="min-h-0 overflow-hidden">
            <WorkspaceGrid />
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
  )
}

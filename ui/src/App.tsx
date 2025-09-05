import TopChrome from './components/TopChrome'
import MonitorSelector from './components/MonitorSelector'
import WorkspaceGrid from './components/WorkspaceGrid'
import RightPane from './components/RightPane'
import BottomControls from './components/BottomControls'

export default function App() {
  return (
    <div className="min-h-dvh min-w-full bg-[rgb(var(--id-bg))] text-[rgb(var(--id-text))]">
      {/* Top bar */}
      <TopChrome />

      {/* Main content frame */}
      <main className="mx-auto max-w-[1260px] px-4 pb-20">
        <div className="grid grid-cols-[260px_1fr_300px] gap-6 pt-4">
          {/* Left */}
          <MonitorSelector />

          {/* Center */}
          <div className="rounded-2xl border border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))] shadow-[var(--id-shadow)]">
            <WorkspaceGrid />
          </div>

          {/* Right */}
          <RightPane />
        </div>
      </main>

      {/* Bottom sticky controls */}
      <BottomControls />
    </div>
  )
}

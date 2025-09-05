import TopChrome from './components/TopChrome';
import MonitorSelector from './components/MonitorSelector';
import WorkspaceGrid from './components/WorkspaceGrid';
import RightPane from './components/RightPane';
import BottomControls from './components/BottomControls';

export default function App() {
  return (
    <div className="min-h-dvh min-w-full bg-neutral-100 flex items-center justify-center">
      {/* Fixed 1280×820 centered app surface */}
      <div className="w-[1280px] h-[820px] bg-neutral-50 shadow ring-1 ring-black/5 overflow-hidden flex flex-col">
        {/* Top chrome (56px) */}
        <TopChrome />

        {/* Main content: 3 columns (no page scroll at 1280×820) */}
        <div className="flex-1 min-h-0 grid grid-cols-[256px_1fr_304px] gap-4 p-4 overflow-hidden">
          {/* Left */}
          <div className="min-h-0">
            <MonitorSelector />
          </div>

          {/* Center */}
          <div className="min-h-0">
            <WorkspaceGrid />
          </div>

          {/* Right */}
          <div className="min-h-0">
            <RightPane />
          </div>
        </div>

        {/* Bottom controls (~48px) */}
        <BottomControls />
      </div>
    </div>
  );
}

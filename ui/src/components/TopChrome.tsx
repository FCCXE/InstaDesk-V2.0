export default function TopChrome() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[rgb(var(--id-border))] bg-[rgb(var(--id-surface))]/95 backdrop-blur supports-[backdrop-filter]:bg-[rgb(var(--id-surface))]/80">
      <div className="mx-auto flex max-w-[1260px] items-center justify-between gap-3 px-4 py-2.5">
        {/* Left: logo + brand */}
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="size-6 rounded-md border border-[rgb(var(--id-border))] bg-white shadow-sm"
          />
          <span className="text-sm font-medium">InstaDesk</span>
        </div>

        {/* Center: page chip */}
        <div className="rounded-full border border-[rgb(var(--id-border))] bg-white px-3 py-1 text-xs font-medium shadow-sm">
          Dashboard
        </div>

        {/* Right: byline */}
        <div className="text-[11px] text-[rgb(var(--id-text-muted))]">
          v0.1 • static&nbsp;&nbsp; <span className="text-gray-400">by</span> FxXe Studios
        </div>
      </div>
    </header>
  )
}

export default function TopChrome() {
  return (
    <header className="h-14 border-b border-gray-200 bg-white grid grid-cols-3 items-center px-4">
      {/* Left: Logo placeholder 24×24 */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-gray-200 border border-gray-300" aria-hidden />
        <span className="text-sm font-medium text-gray-700">InstaDesk</span>
      </div>

      {/* Center: Dashboard pill */}
      <div className="flex items-center justify-center">
        <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200">
          Dashboard
        </span>
      </div>

      {/* Right: Byline */}
      <div className="flex items-center justify-end text-xs text-gray-500">v0.1 • static</div>
    </header>
  );
}

// Optional second row (hidden in Phase 0)
// <div className="h-10 border-b border-gray-200 bg-white px-4 flex items-center text-xs text-gray-500">
//   BUILDING MODE TOOLBAR (Phase 0: hidden)
// </div>

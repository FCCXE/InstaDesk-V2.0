export default function TopChrome() {
  return (
    <header className="h-14 border-b border-gray-200 bg-white grid grid-cols-3 items-center px-4">
      {/* Left: InstaDesk logo */}
      <div className="flex items-center min-w-0">
        <img
          src="/brand/instadesk.png"
          alt="InstaDesk"
          className="max-h-8 object-contain select-none"
          draggable={false}
        />
      </div>

      {/* Center: Dashboard button */}
      <div className="flex items-center justify-center">
        <button
          type="button"
          className="px-5 py-2 text-[0.95rem] font-semibold text-white 
                     bg-[#199CFF] hover:bg-[#1380CC] 
                     rounded-lg shadow-md transition-colors 
                     scale-110"
        >
          DASHBOARD
        </button>
      </div>

      {/* Right: version + FcXe logo */}
      <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
        <span>v0.1 • static</span>
        <span className="text-gray-400">by</span>
        <img
          src="/brand/fcxe.png"
          alt="FcXe Studios"
          className="max-h-7 object-contain select-none"
          draggable={false}
        />
      </div>
    </header>
  );
}

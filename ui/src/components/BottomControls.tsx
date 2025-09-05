export default function BottomControls() {
  return (
    <div className="mt-4 h-12 border-t border-gray-200 bg-white px-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {['Clear All', 'Copy Grid', 'Fill Grid', 'Snap', 'Spacing'].map((label) => (
          <button
            key={label}
            type="button"
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-500">Ready • 1280×820</div>
    </div>
  );
}

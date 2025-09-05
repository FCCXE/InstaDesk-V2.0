// Phase 0 data model stubs
export type Cell = { r: number; c: number; appId?: string };
export type Grid = Cell[];

const cells: Grid = Array.from({ length: 6 * 6 }, (_, i) => ({
  r: Math.floor(i / 6),
  c: i % 6,
}));

export default function WorkspaceGrid() {
  return (
    <section className="h-full bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col">
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {/* Keep the grid square and within available space */}
        <div className="w-full h-full max-w-full max-h-full aspect-square">
          <div className="grid grid-cols-6 grid-rows-6 w-full h-full gap-[3px]">
            {cells.map((cell) => (
              <div
                key={`${cell.r}-${cell.c}`}
                className="bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500">6×6 grid • Phase 0 skeleton</div>
    </section>
  );
}

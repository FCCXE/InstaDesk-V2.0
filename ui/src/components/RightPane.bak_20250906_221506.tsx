import React, { useMemo, useState } from "react";

/**
 * InstaDesk — RightPane (state-only visuals)
 * Tabs: Apps | Layouts | Settings | Help
 * Includes approved Layouts visuals (vertical list + scroll)
 * Tailwind v4 classes only. No external libs.
 */

type TabKey = "apps" | "layouts" | "settings" | "help";
type AppsSubtab = "favorites" | "apps" | "urls";

type LayoutCard = {
  id: string;
  name: string;
  monitors: ("M1" | "M2" | "M3" | "M4")[];
  preset?: boolean;
  updatedISO: string;
  empty?: false;
};

const nowISO = () => new Date().toISOString();

const SAMPLE_LAYOUTS: LayoutCard[] = [
  { id: "dev", name: "Dev - Daily", monitors: ["M1", "M2"], preset: true, updatedISO: nowISO() },
  { id: "research", name: "Research", monitors: ["M2", "M3", "M4"], updatedISO: nowISO() },
  { id: "meetings", name: "Meetings", monitors: ["M1"], updatedISO: nowISO() },
  { id: "streaming", name: "Streaming", monitors: ["M3", "M4"], preset: true, updatedISO: nowISO() },
  { id: "focus", name: "Focus Mode", monitors: ["M2"], updatedISO: nowISO() },
];

export default function RightPane() {
  const [tab, setTab] = useState<TabKey>("layouts"); // open directly on Layouts for your review
  const [appsSubtab, setAppsSubtab] = useState<AppsSubtab>("urls");

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white/60 p-3">
      {/* Top tabs */}
      <div className="flex items-center gap-4 px-2 pb-2">
        <TopTab label="Apps" active={tab === "apps"} onClick={() => setTab("apps")} />
        <TopTab label="Layouts" active={tab === "layouts"} onClick={() => setTab("layouts")} />
        <TopTab label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
        <TopTab label="Help" active={tab === "help"} onClick={() => setTab("help")} />
      </div>

      {/* Body */}
      <div className="relative isolate -mx-1 flex-1 overflow-hidden rounded-xl bg-white/50 px-1">
        {tab === "apps" && (
          <AppsPane appsSubtab={appsSubtab} setAppsSubtab={setAppsSubtab} />
        )}
        {tab === "layouts" && <LayoutsPane />}
        {tab === "settings" && <SettingsPane />}
        {tab === "help" && <HelpPane />}
      </div>
    </aside>
  );
}

/* ----------------------------- Layouts Pane ----------------------------- */

function LayoutsPane() {
  const [scope, setScope] = useState<"all" | "current">("all");
  const [monitor, setMonitor] = useState<"M1" | "M2" | "M3" | "M4">("M2");
  const layouts = useMemo(() => SAMPLE_LAYOUTS, []);

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      {/* Title row */}
      <div className="mb-2 text-lg font-semibold text-slate-700">Layouts</div>

      {/* Scope row */}
      <div className="mb-2 flex items-center gap-2 pr-3">
        <Pill active={scope === "all"} onClick={() => setScope("all")}>
          All Monitors
        </Pill>
        <Pill active={scope === "current"} onClick={() => setScope("current")}>
          Current Monitor ▾
        </Pill>
        <div className="ml-1 text-sm text-slate-500">Monitor: {monitor}</div>

        <div className="ml-auto">
          {/* disabled look as per mock */}
          <button
            className="h-8 cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-400"
            disabled
          >
            + New Layout
          </button>
        </div>
      </div>

      <div className="mb-3 h-px w-full bg-slate-200/80" />

      {/* Scrollable vertical column of cards */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="flex flex-col gap-3">
          {layouts.map((l) => (
            <LayoutCardView key={l.id} card={l} />
          ))}

          {/* Empty slot card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
            <div className="flex items-start gap-3">
              <DragDots />
              <div className="flex-1">
                <div className="text-base font-semibold text-slate-700">(Empty slot)</div>
                <div className="mt-2 text-sm text-slate-500">
                  Empty slot — create a new layout
                </div>
                <div className="mt-4">
                  <button
                    className="h-6 cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 text-xs text-slate-400"
                    disabled
                  >
                    + New Layout
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom breathing room to avoid footer/pane overlap */}
          <div className="h-12" />
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-2 text-xs text-slate-500">
        ⋯ = More: Rename • Duplicate • Export
      </div>
    </div>
  );
}

function LayoutCardView({ card }: { card: LayoutCard }) {
  const updatedStr = useMemo(() => {
    const d = new Date(card.updatedISO);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `Updated: ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  }, [card.updatedISO]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-start gap-3">
        <DragDots />
        <div className="flex-1">
          <div className="text-base font-semibold text-slate-700">{card.name}</div>

          {card.preset && (
            <span className="mt-1 inline-flex h-5 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700">
              Preset
            </span>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {card.monitors.map((m) => (
              <span
                key={m}
                className="inline-flex h-5 items-center rounded-full border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700"
              >
                {m}
              </span>
            ))}
          </div>

          {/* Updated line */}
          <div className="mt-2 text-xs text-slate-500">{updatedStr}</div>

          {/* Two-row actions under Updated */}
          <div className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
            <PrimaryBtn>Apply</PrimaryBtn>
            <GhostBtn>Set Preset</GhostBtn>
            <GhostBtn>Edit</GhostBtn>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <GhostBtn>⋯</GhostBtn>
            <GhostBtn>Delete</GhostBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Apps Pane ------------------------------ */
/* State-only shell to keep the file self-contained & compiling */

function AppsPane({
  appsSubtab,
  setAppsSubtab,
}: {
  appsSubtab: AppsSubtab;
  setAppsSubtab: (k: AppsSubtab) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="mb-2 text-lg font-semibold text-slate-700">Apps</div>

      <div className="mb-2 flex items-center gap-2">
        <Chip active={appsSubtab === "favorites"} onClick={() => setAppsSubtab("favorites")}>
          Favorites
        </Chip>
        <Chip active={appsSubtab === "apps"} onClick={() => setAppsSubtab("apps")}>
          Apps
        </Chip>
        <Chip active={appsSubtab === "urls"} onClick={() => setAppsSubtab("urls")}>
          URLs
        </Chip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {appsSubtab === "favorites" && (
          <div className="text-sm text-slate-500 p-2">
            Favorites (visuals placeholder — state-only)
          </div>
        )}
        {appsSubtab === "apps" && (
          <div className="text-sm text-slate-500 p-2">
            Apps History (visuals placeholder — state-only)
          </div>
        )}
        {appsSubtab === "urls" && (
          <div className="text-sm text-slate-500 p-2">URL Builder (state-only)</div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- Settings / Help --------------------------- */

function SettingsPane() {
  return (
    <div className="h-full overflow-y-auto p-3 pr-2 text-sm text-slate-600">
      <div className="mb-2 text-lg font-semibold text-slate-700">Settings</div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        State-only placeholder.
      </div>
    </div>
  );
}

function HelpPane() {
  return (
    <div className="h-full overflow-y-auto p-3 pr-2 text-sm text-slate-600">
      <div className="mb-2 text-lg font-semibold text-slate-700">Help</div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        State-only placeholder.
      </div>
    </div>
  );
}

/* -------------------------------- UI bits ------------------------------- */

function TopTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl px-4 py-2 text-sm",
        active
          ? "bg-sky-600 text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Pill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "h-8 rounded-full px-3 text-sm",
        active
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "h-8 rounded-full px-3 text-sm",
        active
          ? "bg-sky-600 text-white shadow-sm"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DragDots() {
  // purely decorative handle
  return (
    <div className="mt-2 flex w-3 flex-col items-center justify-start">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="mb-1 h-1 w-1 rounded bg-slate-300/80" />
      ))}
    </div>
  );
}

function PrimaryBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="h-7 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700">
      {children}
    </button>
  );
}

function GhostBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100">
      {children}
    </button>
  );
}

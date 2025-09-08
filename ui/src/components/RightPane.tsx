import React, { useMemo, useState } from "react";

/**
 * RightPane — Phase A visuals (state-only)
 * - Top tabs: Apps | Layouts | Settings | Help
 * - Apps sub-tabs: URLs | Apps (History) | Favorites   (visuals only)
 * - Layouts: uses the dedicated LayoutsPane (vertical list visuals)
 * - Settings: uses the dedicated SettingsPane (approved mock)
 *
 * IMPORTANT:
 * - No OS actions. State-only. Full-file replacement.
 * - Scrollable body; no horizontal overflow.
 * - Compact toolbar/buttons per Phase A conventions.
 */

import LayoutsPane from "./layouts/LayoutsPane";
import SettingsPane from "./settings/SettingsPane";

/* ---------------------------------- Root ---------------------------------- */

export default function RightPane() {
  const [tab, setTab] = useState<MainTab>("Apps");

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Top Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <TopTab label="Apps" active={tab === "Apps"} onClick={() => setTab("Apps")} />
        <TopTab label="Layouts" active={tab === "Layouts"} onClick={() => setTab("Layouts")} />
        <TopTab label="Settings" active={tab === "Settings"} onClick={() => setTab("Settings")} />
        <TopTab label="Help" active={tab === "Help"} onClick={() => setTab("Help")} />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "Apps" && <AppsPane />}
        {tab === "Layouts" && <LayoutsPane />}
        {tab === "Settings" && <SettingsPane />}
        {tab === "Help" && <HelpPane />}
      </div>
    </div>
  );
}

type MainTab = "Apps" | "Layouts" | "Settings" | "Help";

/* ------------------------------- Tabs (UI) -------------------------------- */

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
      type="button"
      onClick={onClick}
      className={[
        "h-8 rounded-full px-3 text-sm",
        active
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/* -------------------------------- Apps Pane ------------------------------- */

function AppsPane() {
  const [sub, setSub] = useState<AppsSubTab>("URLs");
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      {/* Sub-tabs */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SubTab label="URLs" active={sub === "URLs"} onClick={() => setSub("URLs")} />
        <SubTab label="Apps (History)" active={sub === "Apps (History)"} onClick={() => setSub("Apps (History)")} />
        <SubTab label="Favorites" active={sub === "Favorites"} onClick={() => setSub("Favorites")} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {sub === "URLs" && <UrlsBuilderPane />}
        {sub === "Apps (History)" && <AppsHistoryPane />}
        {sub === "Favorites" && <FavoritesPane />}
      </div>
    </div>
  );
}

type AppsSubTab = "URLs" | "Apps (History)" | "Favorites";

function SubTab({
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
      type="button"
      onClick={onClick}
      className={[
        "h-8 rounded-full px-3 text-sm",
        active
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/* ------------------------------- URLs Builder ----------------------------- */

function UrlsBuilderPane() {
  // visuals-only, no state wiring yet
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-base font-semibold text-slate-800">URL Builder</div>

        {/* Browser selector row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Label>Browser</Label>
          <Select disabled value="Choose… ▾" />
          <button
            className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            disabled
          >
            + Add Browser
          </button>
        </div>

        {/* Tabs list (visuals) */}
        <div className="flex flex-col gap-3">
          {[1, 2].map((t) => (
            <div key={t} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Label>Tab Title</Label>
                <Input placeholder="e.g., Research" />
              </div>

              {/* URLs in tab */}
              <div className="flex flex-col gap-2">
                <Input placeholder="https://example.com" />
                <Input placeholder="https://another.example" />
              </div>

              <div className="mt-2">
                <GhostBtn disabled>+ Add URL</GhostBtn>
              </div>
            </div>
          ))}
        </div>

        {/* Open behavior */}
        <div className="mt-3">
          <div className="mb-2 text-sm font-medium text-slate-700">Open behavior</div>
          <div className="flex flex-wrap items-center gap-2">
            <Radio disabled name="open" label="Single window" />
            <Radio disabled name="open" label="Per tab group" />
            <Radio disabled name="open" label="Per URL" />
          </div>
        </div>

        {/* Bottom buttons (state-only) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrimaryBtn disabled>Save</PrimaryBtn>
          <GhostBtn disabled>Preview</GhostBtn>
          <GhostBtn disabled>Reset</GhostBtn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Apps History ------------------------------ */

function AppsHistoryPane() {
  return (
    <div className="flex flex-col gap-3">
      {/* Compact toolbar + search + hints */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input placeholder="Search apps…" className="min-w-[200px]" />
          <GhostBtn disabled>Refresh</GhostBtn>
        </div>
        <div className="text-xs text-slate-500">
          Select cells and <span className="font-medium">Pick an app</span> to enable Assign.
        </div>
      </div>

      {/* History list (visuals) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-col">
          {["Outlook", "Chrome", "VS Code", "Notepad", "GitHub Desktop"].map((app) => (
            <button
              key={app}
              className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
              disabled
            >
              <span>{app}</span>
              <span className="text-xs text-slate-400">Recently used</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Favorites ------------------------------- */

function FavoritesPane() {
  const favorites = useMemo(
    () => [
      { id: "fav1", name: "Outlook", logo: "📧" },
      { id: "fav2", name: "Chrome", logo: "🌐" },
      { id: "fav3", name: "VS Code", logo: "🧩" },
      { id: "fav4", name: "Notepad", logo: "📝" },
      { id: "fav5", name: "GitHub", logo: "🐙" },
    ],
    []
  );

  const editMode = false; // visuals only

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* Header actions (right) */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-800">Favorites</div>
          <div className="flex items-center gap-2">
            <GhostBtn disabled>{editMode ? "Done" : "Edit"}</GhostBtn>
            <GhostBtn disabled>+ Add Favorite</GhostBtn>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-2">
          {favorites.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{f.logo}</span>
                <span className="text-sm font-medium text-slate-800">{f.name}</span>
                {/* filled star (approved visuals) */}
                <span className="ml-1 text-amber-500">★</span>
              </div>
              {/* Trash only in Edit mode (visuals) */}
              {editMode ? <GhostBtn disabled>🗑 Delete</GhostBtn> : <div className="h-7" />}
            </div>
          ))}
        </div>

        {/* Full-width Add Custom button at bottom */}
        <div className="mt-3">
          <button
            className="h-8 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            disabled
          >
            + Add Custom App/URL
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Help ----------------------------------- */

function HelpPane() {
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-base font-semibold text-slate-800">Help</div>
        <div className="mt-2 text-sm text-slate-600">
          This is a visuals-only shell for Phase A. No OS actions are performed. Use the tabs above
          to preview Apps, Layouts, and Settings UI. For support, open the project README.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Tiny UI bits ------------------------------ */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-slate-700">{children}</div>;
}

function Input({
  placeholder,
  className = "",
}: {
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      disabled
      placeholder={placeholder}
      className={[
        "h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-sky-300",
        "disabled:cursor-not-allowed",
        className,
      ].join(" ")}
    />
  );
}

function Select({
  value,
  disabled = true,
}: {
  value: string;
  disabled?: boolean;
}) {
  return (
    <button
      className="h-7 min-w-[140px] rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
      disabled={disabled}
    >
      {value}
    </button>
  );
}

function Radio({ name, label, disabled = true }: { name: string; label: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="radio" name={name} disabled={disabled} className="h-3 w-3" />
      <span>{label}</span>
    </label>
  );
}

function PrimaryBtn({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="h-7 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

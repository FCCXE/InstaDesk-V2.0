import React, { useMemo, useState } from "react";

/**
 * RightPane — Phase A visuals (state-only)
 * - Top tabs: Apps | Layouts | Settings | Help
 * - Apps sub-tabs: URLs | Apps (History) | Favorites
 * - Layouts & Settings: mounted from dedicated panes
 *
 * NOTE: Only the URL Builder pane is wired to AppState in this block.
 */

import LayoutsPane from "./layouts/LayoutsPane";
import SettingsPane from "./settings/SettingsPane";
import { useAppState } from "../state/AppState";

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
        <SubTab label="URL's" active={sub === "URLs"} onClick={() => setSub("URLs")} />
        <SubTab label="Apps" active={sub === "Apps (History)"} onClick={() => setSub("Apps (History)")} />
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
  const {
    urlBuilder,
    browsers,
    setUrlBrowser,
    addBrowser,
    addTabGroup,
    setTabTitle,
    setUrlLine,
    addUrlLine,
    resetUrlBuilder,
    saveUrlBuilder,
    previewUrlBuilder,
  } = useAppState();

  const [flash, setFlash] = useState<string | null>(null);
  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1500);
  };

  const onSave = () => {
    const snap = saveUrlBuilder();
    showFlash(`Saved: ${snap.tabGroups.length} tab group(s).`);
  };

  const onReset = () => {
    resetUrlBuilder();
    showFlash("URL Builder reset.");
  };

  const onPreview = () => {
    const snap = previewUrlBuilder();
    showFlash(`Preview: ${snap.tabGroups.reduce((n, g) => n + g.urls.filter(Boolean).length, 0)} URL(s).`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-base font-semibold text-slate-800">URL Builder</div>

        {/* Browser selector row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Label>Browser</Label>
          <select
            value={urlBuilder.browser ?? ""}
            onChange={(e) => setUrlBrowser(e.target.value || null)}
            className="h-7 min-w-[140px] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            <option value="">Choose…</option>
            {browsers.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <GhostBtn
            onClick={() => {
              const name = prompt("Add browser (e.g., Brave):");
              if (name && name.trim()) addBrowser(name.trim());
            }}
          >
            + Add Browser
          </GhostBtn>
        </div>

        {/* Tab groups */}
        <div className="flex flex-col gap-3">
          {urlBuilder.tabGroups.map((g) => (
            <div key={g.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Label>Tab Title</Label>
                <Input
                  value={g.title}
                  onChange={(v) => setTabTitle(g.id, v)}
                  placeholder="e.g., Research"
                />
              </div>

              <div className="flex flex-col gap-2">
                {g.urls.map((u, i) => (
                  <Input
                    key={i}
                    value={u}
                    onChange={(v) => setUrlLine(g.id, i, v)}
                    placeholder={i === 0 ? "https://example.com" : "https://another.example"}
                  />
                ))}
              </div>

              <div className="mt-2">
                <GhostBtn onClick={() => addUrlLine(g.id)}>+ Add URL</GhostBtn>
              </div>
            </div>
          ))}
        </div>

        {/* Open behavior (visual only for now) */}
        <div className="mt-3">
          <div className="mb-2 text-sm font-medium text-slate-700">Open behavior</div>
          <div className="flex flex-wrap items-center gap-2">
            <Radio name="open" label="Single window" />
            <Radio name="open" label="Per tab group" />
            <Radio name="open" label="Per URL" />
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrimaryBtn onClick={onSave}>Save</PrimaryBtn>
          <GhostBtn onClick={onPreview}>Preview</GhostBtn>
          <GhostBtn onClick={onReset}>Reset</GhostBtn>
        </div>

        {/* tiny inline confirmation */}
        {flash && (
          <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700">
            {flash}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Apps History ------------------------------ */

function AppsHistoryPane() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input placeholder="Search applications …" className="min-w-[200px]" />
          <GhostBtn disabled>Refresh</GhostBtn>
        </div>
        <div className="text-xs text-slate-500">
          Pick an app and select cells to enable Assign
        </div>
      </div>

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

  const editMode = false;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-800">Favorites</div>
          <div className="flex items-center gap-2">
            <GhostBtn disabled>{editMode ? "Done" : "Edit"}</GhostBtn>
            <GhostBtn disabled>+ Add Favorite</GhostBtn>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {favorites.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{f.logo}</span>
                <span className="text-sm font-medium text-slate-800">{f.name}</span>
                <span className="ml-1 text-amber-500">★</span>
              </div>
              {editMode ? <GhostBtn disabled>🗑 Delete</GhostBtn> : <div className="h-7" />}
            </div>
          ))}
        </div>

        <div className="mt-3">
          <button className="h-8 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100" disabled>
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
  value,
  onChange,
}: {
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (val: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={[
        "h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-sky-300",
        className,
      ].join(" ")}
    />
  );
}

function Radio({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="radio" name={name} className="h-3 w-3" />
      <span>{label}</span>
    </label>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

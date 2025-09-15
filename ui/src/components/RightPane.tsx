import React, { useMemo, useState } from "react";

/**
 * RightPane — Apps | Layouts | Settings | Help
 * Change in this commit: Apps → Apps selection/action row buttons now
 * enforce two-line labels with proper centering and spacing.
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
  const [sub, setSub] = useState<AppsSubTab>("Apps");
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      {/* Sub-tabs */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SubTab label="URL's" active={sub === "URLs"} onClick={() => setSub("URLs")} />
        <SubTab label="Apps" active={sub === "Apps"} onClick={() => setSub("Apps")} />
        <SubTab label="Favorites" active={sub === "Favorites"} onClick={() => setSub("Favorites")} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {sub === "URLs" && <UrlsBuilderPane />}
        {sub === "Apps" && <AppsHistoryPane />}
        {sub === "Favorites" && <FavoritesPane />}
      </div>
    </div>
  );
}

type AppsSubTab = "URLs" | "Apps" | "Favorites";

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
/* unchanged visuals/behavior */

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
    setOpenMode,
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
    showFlash(
      `Preview: ${snap.tabGroups.reduce((n, g) => n + g.urls.filter(Boolean).length, 0)} URL(s).`
    );
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

        {/* Open behavior — wired */}
        <div className="mt-3">
          <div className="mb-2 text-sm font-medium text-slate-700">Open behavior</div>
          <div className="flex flex-wrap items-center gap-2">
            <Radio
              name="open"
              label="Single window"
              checked={urlBuilder.openMode === "single"}
              onChange={() => setOpenMode("single")}
            />
            <Radio
              name="open"
              label="Per tab group"
              checked={urlBuilder.openMode === "per-group"}
              onChange={() => setOpenMode("per-group")}
            />
            <Radio
              name="open"
              label="Per URL"
              checked={urlBuilder.openMode === "per-url"}
              onChange={() => setOpenMode("per-url")}
            />
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

/* ------------------------------ Apps (History) ---------------------------- */

function AppsHistoryPane() {
  const {
    selection,
    selectedApp,
    setSelectedApp,
    assignSelected,
    unassignSelected,
  } = useAppState();

  const [query, setQuery] = useState("");

  // Exact list/order per approved visual
  const APP_LIST = useMemo(
    () => [
      { id: "Outlook", category: "Communication", dot: "bg-emerald-500" },
      { id: "Chrome", category: "Browser", dot: "bg-sky-500" },
      { id: "VS Code", category: "Development", dot: "bg-violet-500" },
      { id: "Notepad", category: "Text", dot: "bg-slate-400" },
      { id: "GitHub", category: "Development", dot: "bg-indigo-500" },
      { id: "Stack Overflow", category: "Development", dot: "bg-amber-500" },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APP_LIST;
    return APP_LIST.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [APP_LIST, query]);

  const selCount = selection.size;
  const canAssign = Boolean(selectedApp && selCount > 0);
  const canUnassign = selCount > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Top card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* Search row */}
        <div className="mb-3">
          <Input
            placeholder="Search applications …"
            className="w-full"
            value={query}
            onChange={setQuery}
          />
        </div>

        {/* Selection + equal-width two-line buttons */}
        <div className="mb-2 grid grid-cols-12 items-center gap-2">
          <div className="col-span-4 text-xs text-slate-700">
            Selection: {selCount > 0 ? selCount : "none"}
          </div>

          <div className="col-span-8">
            <div className="grid grid-cols-2 gap-2">
              <PrimaryBtn
                onClick={() => canAssign && assignSelected()}
                disabled={!canAssign}
                className="h-12 w-full whitespace-normal leading-tight text-center"
                forceTwoRows
                top="Assign to"
                bottom="Selection"
              />

              <GhostBtn
                onClick={() => canUnassign && unassignSelected()}
                disabled={!canUnassign}
                className="h-12 w-full whitespace-normal leading-tight text-center"
                forceTwoRows
                top="Unassign"
                bottom="Selection"
              />
            </div>
          </div>
        </div>

        {/* Helper line */}
        <div className="text-xs text-slate-500">
          Pick an app and select cells to enable Assign
        </div>

        {/* Disabled input bar (visual only) */}
        <div className="mt-3">
          <input
            disabled
            className="h-8 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500"
          />
        </div>
      </div>

      {/* App History list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2">
        <div className="px-2 py-1 text-sm font-medium text-slate-700">App History:</div>
        <div className="flex flex-col">
          {filtered.map((app) => {
            const active = selectedApp === (app.id as any);
            return (
              <button
                key={app.id}
                onClick={() => setSelectedApp(active ? null : (app.id as any))}
                className={[
                  "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm focus:outline-none",
                  active
                    ? "bg-sky-50 text-slate-800 ring-1 ring-sky-200"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${app.dot}`} />
                  <span className="font-medium">{app.id}</span>
                </div>
                <span className="text-xs text-slate-500">{app.category}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-slate-500">
              No apps match your search.
            </div>
          )}
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
        "h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-sky-300",
        className,
      ].join(" ")}
    />
  );
}

function Radio({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked?: boolean;
  onChange?: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input
        type="radio"
        name={name}
        className="h-3 w-3"
        checked={!!checked}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

/* Buttons
   - Support optional two-line content via props {forceTwoRows, top, bottom}
   - Force centered, stacked layout with flex-col
*/
function PrimaryBtn({
  children,
  onClick,
  disabled,
  className = "",
  forceTwoRows = false,
  top,
  bottom,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  forceTwoRows?: boolean;
  top?: string;
  bottom?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-7 rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed",
        "flex flex-col items-center justify-center text-center whitespace-normal leading-tight",
        className,
      ].join(" ")}
    >
      {forceTwoRows && (top || bottom) ? (
        <>
          <span className="block">{top}</span>
          <span className="block">{bottom}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
  className = "",
  forceTwoRows = false,
  top,
  bottom,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  forceTwoRows?: boolean;
  top?: string;
  bottom?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-7 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed",
        "flex flex-col items-center justify-center text-center whitespace-normal leading-tight",
        className,
      ].join(" ")}
    >
      {forceTwoRows && (top || bottom) ? (
        <>
          <span className="block">{top}</span>
          <span className="block">{bottom}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

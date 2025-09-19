import React, { useMemo, useState, useEffect } from "react";

/* Other panes (unchanged) */
import LayoutsPane from "./layouts/LayoutsPane";
import SettingsPane from "./settings/SettingsPane";

/* App state (grid selection, assign/unassign, URL builder state, etc.) */
import { useAppState } from "../state/AppState";

/* Favorites + History services (persisted storage) */
import {
  listFavorites,
  removeFavorite,
  type Favorite,
} from "../services/FavoritesService";
import {
  listHistory,
  removeHistory,
  clearHistory,
  type AppHistoryItem,
} from "../services/AppsHistoryService";

/* Modals */
import AddFavoriteModal from "./common/AddFavoriteModal";
import BrowseAppModal from "./common/BrowseAppModal";

/* Helper */
import TruncateText from "./common/TruncateText";

/* -------------------------------------------------------------------------- */
/*                                    Shell                                   */
/* -------------------------------------------------------------------------- */

type MainTab = "Apps" | "Layouts" | "Settings" | "Help";
type AppsSubTab = "URLs" | "Apps" | "Favorites";

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

/* -------------------------------------------------------------------------- */
/*                                   Apps Pane                                */
/* -------------------------------------------------------------------------- */

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

      {/* Content area:
          - URLs pane: outer vertical scroll so Save/Preview/Reset are reachable
          - Apps/Favorites: preserve previous layout (no extra outer scroll) */}
      <div
        className={
          sub === "URLs"
            ? "min-h-0 flex-1 overflow-y-auto pr-2"
            : "min-h-0 flex-1 overflow-visible pr-2"
        }
      >
        {sub === "URLs" && <UrlsBuilderPane />}
        {sub === "Apps" && <AppsAppsPane />}
        {sub === "Favorites" && <FavoritesPane />}
      </div>
    </div>
  );
}

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

/* -------------------------------------------------------------------------- */
/*                        Apps → Apps (tightened layout)                      */
/* -------------------------------------------------------------------------- */

type AppsHistoryRow = {
  id: string;
  label: string;
  category: string;
  dot: string;
  path?: string; // for Custom rows
};

function AppsAppsPane() {
  const { selection, selectedApp, setSelectedApp, assignSelected, unassignSelected } = useAppState();

  /* UI state */
  const [query, setQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showModal, setShowModal] = useState(false);

  /* Seeds (visual) — expanded so you see the scrollbar immediately */
  const SEEDS = useMemo(
    () => [
      { id: "Outlook", category: "Communication", dot: "bg-emerald-500" },
      { id: "Chrome", category: "Browser", dot: "bg-sky-500" },
      { id: "VS Code", category: "Development", dot: "bg-violet-500" },
      { id: "Notepad", category: "Text", dot: "bg-slate-400" },
      { id: "GitHub", category: "Development", dot: "bg-indigo-500" },
      { id: "Stack Overflow", category: "Development", dot: "bg-amber-500" },
      { id: "Slack", category: "Communication", dot: "bg-fuchsia-500" },
      { id: "Teams", category: "Communication", dot: "bg-purple-500" },
      { id: "Zoom", category: "Communication", dot: "bg-blue-500" },
      { id: "Edge", category: "Browser", dot: "bg-cyan-500" },
      { id: "Firefox", category: "Browser", dot: "bg-orange-500" },
      { id: "Brave", category: "Browser", dot: "bg-amber-600" },
      { id: "Figma", category: "Design", dot: "bg-pink-500" },
      { id: "Photoshop", category: "Design", dot: "bg-blue-600" },
      { id: "Illustrator", category: "Design", dot: "bg-amber-700" },
      { id: "Word", category: "Office", dot: "bg-sky-600" },
      { id: "Excel", category: "Office", dot: "bg-green-600" },
      { id: "PowerPoint", category: "Office", dot: "bg-red-500" },
      { id: "Postman", category: "Development", dot: "bg-orange-600" },
      { id: "Docker", category: "Development", dot: "bg-sky-700" },
    ],
    []
  );

  /* Persisted history */
  const [history, setHistory] = useState<AppHistoryItem[]>(() => listHistory());

  /* Rows */
  const rows: AppsHistoryRow[] = useMemo(() => {
    const custom: AppsHistoryRow[] = history.map((h) => ({
      id: h.id,
      label: h.title || h.path,
      category: "Custom",
      dot: "bg-slate-500",
      path: h.path,
    }));
    const seedRows: AppsHistoryRow[] = SEEDS.map((s) => ({
      id: `seed:${s.id}`,
      label: s.id,
      category: s.category,
      dot: s.dot,
    }));
    return [...seedRows, ...custom];
  }, [SEEDS, history]);

  /* Filter */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.label.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
    );
  }, [rows, query]);

  /* Derived */
  const selCount = selection.size;
  const canAssign = Boolean(selectedApp && selCount > 0);
  const canUnassign = selCount > 0;

  /* Actions */
  const onBrowse = () => setShowModal(true);
  const onRefresh = () => {
    setQuery("");
    setSelectedApp(null);
    setHistory(listHistory());
  };
  const onClearCustom = () => {
    if (!confirm("Clear all Custom history items? This cannot be undone.")) return;
    clearHistory();
    setHistory(listHistory());
    setSelectedApp(null);
  };
  const onDeleteCustom = (row: AppsHistoryRow) => {
    if (!row.path) return;
    if (!confirm(`Delete "${row.label}" from history?`)) return;
    const match = history.find((h) => h.path.toLowerCase() === row.path!.toLowerCase());
    if (match) {
      removeHistory(match.id);
      setHistory(listHistory());
      if (selectedApp === (row.label as any)) setSelectedApp(null);
    }
  };
  const onAssign = () => {
    if (!canAssign) return;
    assignSelected();
  };
  const onUnassign = () => {
    if (!canUnassign) return;
    unassignSelected();
  };

  /* ----------------------------- Render ---------------------------------- */

  // Compact button sizing (uniform)
  const smallBtnH = editMode ? "h-9" : "h-8"; // slightly taller in edit mode for two-line Clear/Custom
  const smallBtnCommon = `shrink-0 ${smallBtnH} px-2 text-[11px]`;

  return (
    <div className="flex flex-col gap-3">
      {/* Controls card — exact layout */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* Title */}
        <div className="text-[13px] font-medium text-slate-600">
          Select Cells and Pick an App to enable assign
        </div>

        {/* Button row: compact sizing + extra right padding; never hits card edge */}
        <div className="mt-3 flex items-center gap-1 pr-4">
          <GhostBtn className={smallBtnCommon} onClick={onBrowse}>
            Browse
          </GhostBtn>
          <GhostBtn className={smallBtnCommon} onClick={onRefresh}>
            Refresh
          </GhostBtn>
          <GhostBtn className={smallBtnCommon} onClick={() => setEditMode((v) => !v)}>
            {editMode ? "Done" : "Edit"}
          </GhostBtn>

        {editMode && (
            <GhostBtn
              className="shrink-0 h-9 w-[64px] mr-1 px-1 text-[11px] whitespace-normal text-center leading-tight overflow-hidden"
              onClick={onClearCustom}
              title="Clear Custom"
            >
              <span className="block">Clear</span>
              <span className="block">Custom</span>
            </GhostBtn>
          )}
        </div>

        {/* Selection label (left) + Assign/Unassign stack (right, narrower) */}
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-xs text-slate-700">
            <span className="truncate">Selection Grid : {selCount > 0 ? selCount : "none"}</span>
          </div>

          <div className="flex flex-col items-end gap-2">
            <PrimaryBtn onClick={onAssign} disabled={!canAssign} className="h-8 w-[132px]">
              Assign to Selection
            </PrimaryBtn>
            <GhostBtn onClick={onUnassign} disabled={!canUnassign} className="h-8 w-[132px]">
              Unassign Selection
            </GhostBtn>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search applications from App History ..."
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>
      </div>

      {/* App History list (internal vertical scroll) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2">
        <div className="px-2 py-1 text-sm font-medium text-slate-700">App History :</div>

        <div className="max-h-[360px] overflow-y-auto pr-1">
          {filtered.map((r) => {
            const active = selectedApp === (r.label as any);
            const isCustom = r.category === "Custom";
            const title = isCustom && r.path ? r.path : undefined;

            return (
              <div
                key={`${r.category}:${r.id}`}
                className={[
                  "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                  active ? "bg-sky-50 text-slate-800 ring-1 ring-sky-200" : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                title={title}
              >
                <button
                  onClick={() => setSelectedApp(active ? null : (r.label as any))}
                  className="flex w-full items-center justify-between focus:outline-none"
                  aria-pressed={active}
                  title={title}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${r.dot}`} />
                    <span className="truncate font-medium">{r.label}</span>
                  </div>
                  <div className="ml-2 flex items-center gap-2">
                    <span className="text-xs text-slate-500">{r.category}</span>
                    {isCustom && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">
                        Custom
                      </span>
                    )}
                  </div>
                </button>

                {editMode && isCustom ? (
                  <GhostBtn onClick={() => onDeleteCustom(r)} className="ml-3 h-7 whitespace-nowrap px-2">
                    🗑 Delete
                  </GhostBtn>
                ) : (
                  <div className="h-7 w-[64px]" />
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-slate-500">No apps match your search.</div>
          )}
        </div>
      </div>

      {/* Browse modal */}
      <BrowseAppModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSaved={(item) => {
          setHistory(listHistory());
          setSelectedApp(item.title as any);
          setShowModal(false);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          URL Builder (unchanged)                           */
/* -------------------------------------------------------------------------- */

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
    showFlash(`Preview: ${snap.tabGroups.reduce((n, g) => n + g.urls.filter(Boolean).length, 0)} URL(s).`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-base font-semibold text-slate-800">URL Builder</div>

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
          <GhostBtn onClick={() => addTabGroup()}>+ Add Tab Group</GhostBtn>
        </div>

        {urlBuilder.tabGroups.map((g) => (
          <div key={g.id} className="mb-3 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Label>Tab Title</Label>
              <Input value={g.title} onChange={(v) => setTabTitle(g.id, v)} placeholder="e.g., Research" />
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PrimaryBtn onClick={onSave}>Save</PrimaryBtn>
          <GhostBtn onClick={onPreview}>Preview</GhostBtn>
          <GhostBtn onClick={onReset}>Reset</GhostBtn>
        </div>

        {flash && (
          <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700">
            {flash}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Favorites (unchanged)                             */
/* -------------------------------------------------------------------------- */

function FavoritesPane() {
  const [editMode, setEditMode] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>(() => listFavorites());
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setFavorites(listFavorites());
  }, []);

  const onDelete = (id: string) => {
    removeFavorite(id);
    setFavorites(listFavorites());
  };
  const onAdded = () => {
    setFavorites(listFavorites());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-800">Favorites</div>
          <div className="flex items-center gap-2">
            <GhostBtn onClick={() => setEditMode((v) => !v)}>{editMode ? "Done" : "Edit"}</GhostBtn>
            <GhostBtn onClick={() => setShowAdd(true)}>+ Add Favorite</GhostBtn>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {favorites.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-base">{f.icon ?? "⭐"}</span>
                <TruncateText maxWidthClass="max-w-[520px]" className="text-sm font-medium text-slate-800">
                  {f.title}
                </TruncateText>
                <span className="ml-1 text-amber-500">★</span>
              </div>
              {editMode ? <GhostBtn onClick={() => onDelete(f.id)}>🗑 Delete</GhostBtn> : <div className="h-7" />}
            </div>
          ))}
          {favorites.length === 0 && (
            <div className="rounded-md border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">
              No favorites yet. Click “+ Add Favorite” to add an App or a URL.
            </div>
          )}
        </div>

        <div className="mt-3">
          <button
            className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => setShowAdd(true)}
          >
            + Add Custom App/URL
          </button>
        </div>
      </div>

      <AddFavoriteModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={onAdded} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Help                                    */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                                Tiny UI bits                                */
/* -------------------------------------------------------------------------- */

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
      <input type="radio" name={name} className="h-3 w-3" checked={!!checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-md bg-sky-600 px-3 text-xs font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed",
        "flex items-center justify-center whitespace-nowrap",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-7 rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed",
        "px-3 whitespace-nowrap",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

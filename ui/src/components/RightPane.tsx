import React, { useMemo, useState, useEffect } from "react";

/* Other panes (unchanged) */
import LayoutsPane from "./layouts/LayoutsPane";
import SettingsPane from "./settings/SettingsPane";

/* App state (grid selection, assign/unassign, URL builder state, etc.) */
import { useAppState } from "../state/AppState";

/* App catalog — used to surface the default args hint under the per-cell override input */
import { APP_CATALOG } from "../services/appsCatalog";

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
import {
  listUrlGroups,
  addUrlGroup,
  removeUrlGroup,
  type UrlGroup,
} from "../services/UrlGroupsService";
import {
  listHiddenIds,
  hideId as hideCatalogId,
  showId as showCatalogId,
  showAll as showAllCatalogIds,
} from "../services/HiddenAppsService";

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

  // Quick Presets "Manage" link in the left pane dispatches this event.
  useEffect(() => {
    const onOpen = () => setTab("Layouts");
    window.addEventListener("insta:open-layouts-tab", onOpen);
    return () => window.removeEventListener("insta:open-layouts-tab", onOpen);
  }, []);

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
  path?: string;          // for Custom rows
  urlGroup?: UrlGroup;    // for URL Group rows
  favorite?: Favorite;    // for Favorite rows
  // Catalog seed bookkeeping (only set on seed rows):
  isHiddenSeed?: boolean; // true when revealHidden is on and the user previously hid this seed
  seedId?: string;        // the catalog id, used to call hide/show services
};

function AppsAppsPane() {
  const {
    selection, selectedApp, setSelectedApp,
    assignSelected, unassignSelected,
    argsForSelection, hasMixedArgsInSelection, setArgsForSelection,
    assignments,
  } = useAppState();

  /* ---------------------------------------------------------------------- */
  /* Per-cell args override input — lets two regions of the same app launch */
  /* with different parameters (e.g. two File Explorer windows opened on    */
  /* different folders). Pre-fills from whatever the selected cells already */
  /* carry; "" reverts to the catalog default for that app.                 */
  /* ---------------------------------------------------------------------- */
  const [argsDraft, setArgsDraft] = useState<string>("");
  const [argsDirty, setArgsDirty] = useState<boolean>(false);
  // When the selection changes, pull the canonical value back into the input
  // (unless the user has unsaved edits in flight).
  useEffect(() => {
    if (argsDirty) return;
    setArgsDraft(argsForSelection);
  }, [argsForSelection, argsDirty]);
  const onArgsChange = (v: string) => { setArgsDraft(v); setArgsDirty(true); };
  const onArgsApply = () => { setArgsForSelection(argsDraft); setArgsDirty(false); };
  const onArgsClear = () => { setArgsForSelection(""); setArgsDraft(""); setArgsDirty(false); };

  // Figure out a default-args hint for the selected cells. Prefer the app
  // bound to the first selected cell so the hint reflects what's actually
  // on the grid (not just what's currently armed in the app picker).
  const appsInSelection = useMemo(() => {
    const set = new Set<string>();
    selection.forEach((k) => { const a = assignments[k]; if (a) set.add(a); });
    return [...set];
  }, [selection, assignments]);
  const hintApp =
    appsInSelection.length === 1 ? appsInSelection[0] :
    appsInSelection.length === 0 ? (selectedApp ?? null) :
    null; // mixed apps in selection — don't claim a default
  const hintCatalogArgs = useMemo(() => {
    if (!hintApp) return null;
    return APP_CATALOG.find(e => e.id === hintApp)?.args ?? null;
  }, [hintApp]);

  /* UI state */
  const [query, setQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // Which URL Group rows are currently expanded to reveal their URL list.
  // Set of group ids. Local-only UI state — purely ephemeral, fine to lose
  // on tab switch (App History list is the only place this matters).
  const [expandedUrlGroups, setExpandedUrlGroups] = useState<Set<string>>(new Set());
  const toggleUrlGroupExpanded = (groupId: string) => {
    setExpandedUrlGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  /* Seeds (visual) — expanded so you see the scrollbar immediately */
  const SEEDS = useMemo(
    () => [
      { id: "Outlook", category: "Communication", dot: "bg-emerald-500" },
      { id: "Chrome", category: "Browser", dot: "bg-sky-500" },
      { id: "VS Code", category: "Development", dot: "bg-violet-500" },
      { id: "Notepad", category: "Text", dot: "bg-slate-400" },
      { id: "File Explorer", category: "System", dot: "bg-yellow-500" },
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

  /* Persisted URL groups (refresh when the URL Builder saves new ones) */
  const [urlGroups, setUrlGroups] = useState<UrlGroup[]>(() => listUrlGroups());
  useEffect(() => {
    const onChanged = () => setUrlGroups(listUrlGroups());
    window.addEventListener("insta:url-groups-changed", onChanged);
    return () => window.removeEventListener("insta:url-groups-changed", onChanged);
  }, []);

  /* Persisted favorites (refresh when AddFavoriteModal adds or Edit deletes) */
  const [favorites, setFavorites] = useState<Favorite[]>(() => listFavorites());
  useEffect(() => {
    const onChanged = () => setFavorites(listFavorites());
    window.addEventListener("insta:favorites-changed", onChanged);
    return () => window.removeEventListener("insta:favorites-changed", onChanged);
  }, []);

  /* Catalog seeds the user has hidden — persistent in localStorage. Catalog
     seeds are hardcoded in appsCatalog.ts so they can't be truly deleted,
     but they can be hidden from this list. Restorable via the
     "Show N hidden" toggle below. */
  const [hiddenSeedIds, setHiddenSeedIds] = useState<Set<string>>(() => listHiddenIds());
  // Reveal hidden seeds in the list (read-only) so the user can restore
  // them in Edit mode. False = hidden seeds excluded from the rows array.
  const [revealHidden, setRevealHidden] = useState(false);

  /* Rows */
  const rows: AppsHistoryRow[] = useMemo(() => {
    const groupRows: AppsHistoryRow[] = urlGroups.map((g) => ({
      id: `urlgroup:${g.id}`,
      label: g.name,
      category: `URL Group · ${g.browser} · ${g.urls.length} tab${g.urls.length === 1 ? "" : "s"}`,
      dot: "bg-cyan-500",
      urlGroup: g,
    }));
    const favRows: AppsHistoryRow[] = favorites.map((f) => ({
      id: `fav:${f.id}`,
      label: f.title,
      category: f.kind === "url" ? "Favorite · URL" : "Favorite · App",
      dot: f.kind === "url" ? "bg-amber-500" : "bg-amber-600",
      favorite: f,
    }));
    const custom: AppsHistoryRow[] = history.map((h) => ({
      id: h.id,
      label: h.title || h.path,
      category: "Custom",
      dot: "bg-slate-500",
      path: h.path,
    }));
    // Apply hidden-seeds filter. When revealHidden is on (e.g., from the
    // "+ Show N hidden" toggle), include all seeds AND mark which are
    // hidden so the row UI can show a "Hidden" pill + a "Restore" action.
    const seedRows: AppsHistoryRow[] = SEEDS
      .filter((s) => revealHidden || !hiddenSeedIds.has(s.id))
      .map((s) => ({
        id: `seed:${s.id}`,
        label: s.id,
        category: s.category,
        dot: s.dot,
        isHiddenSeed: hiddenSeedIds.has(s.id),
        seedId: s.id,
      }));
    // URL groups + Favorites first (most directly user-curated), then custom, then seeds.
    return [...groupRows, ...favRows, ...custom, ...seedRows];
  }, [SEEDS, history, urlGroups, favorites, hiddenSeedIds, revealHidden]);

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
    setUrlGroups(listUrlGroups());
    setFavorites(listFavorites());
  };
  const onClearCustom = () => {
    if (!confirm("Clear all Custom history items? This cannot be undone.")) return;
    clearHistory();
    setHistory(listHistory());
    setSelectedApp(null);
  };
  // Hide a catalog seed from the App History list. Persistent across
  // sessions via HiddenAppsService. The catalog entry itself is untouched —
  // the seed can still be referenced by saved Layouts (via resolveAppTarget)
  // and the user can restore it any time via the "Show N hidden" toggle.
  const onHideSeed = (row: AppsHistoryRow) => {
    if (!row.seedId) return;
    hideCatalogId(row.seedId);
    setHiddenSeedIds(listHiddenIds());
    if (selectedApp === (row.label as any)) setSelectedApp(null);
  };
  const onShowSeed = (row: AppsHistoryRow) => {
    if (!row.seedId) return;
    showCatalogId(row.seedId);
    setHiddenSeedIds(listHiddenIds());
  };
  const onShowAllHiddenSeeds = () => {
    showAllCatalogIds();
    setHiddenSeedIds(listHiddenIds());
  };

  const onDeleteCustom = (row: AppsHistoryRow) => {
    // URL group rows — delete from UrlGroupsService.
    if (row.urlGroup) {
      if (!confirm(`Delete URL group "${row.label}"?`)) return;
      removeUrlGroup(row.urlGroup.id);
      setUrlGroups(listUrlGroups());
      window.dispatchEvent(new CustomEvent("insta:url-groups-changed"));
      if (selectedApp === (row.label as any)) setSelectedApp(null);
      return;
    }
    // Favorite rows — delete from FavoritesService.
    if (row.favorite) {
      if (!confirm(`Delete favorite "${row.label}"?`)) return;
      removeFavorite(row.favorite.id);
      setFavorites(listFavorites());
      window.dispatchEvent(new CustomEvent("insta:favorites-changed"));
      if (selectedApp === (row.label as any)) setSelectedApp(null);
      return;
    }
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

        {/* Per-cell args override — only shown when there's a selection.
            Lets two regions of the same app launch with different args
            (e.g., two File Explorer windows pointed at different folders). */}
        {selCount > 0 && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Launch args for selection
                {hasMixedArgsInSelection && (
                  <span className="ml-1 normal-case tracking-normal text-amber-600">
                    (mixed)
                  </span>
                )}
              </label>
              {argsForSelection && (
                <button
                  type="button"
                  onClick={onArgsClear}
                  className="text-[10px] text-slate-500 hover:text-red-600"
                  title="Clear override → revert these cells to the app's default args"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={argsDraft}
                onChange={(e) => onArgsChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onArgsApply() }}
                placeholder={
                  hasMixedArgsInSelection
                    ? "Mixed — type to overwrite all selected cells"
                    : 'e.g. "C:\\Downloads" for File Explorer'
                }
                className="h-7 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <PrimaryBtn
                onClick={onArgsApply}
                disabled={!argsDirty}
                className="h-7 px-3 text-[11px]"
              >
                Apply
              </PrimaryBtn>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              {hintApp && hintCatalogArgs
                ? <>Replaces app default <code className="rounded bg-slate-200 px-1">{hintCatalogArgs}</code>. Include it in your override if you still need it.</>
                : hintApp
                  ? <>App default is empty. Whatever you type here is appended to the launch command.</>
                  : <>Differentiates two regions of the same app (e.g. two File Explorer windows on distinct folders).</>}
            </div>
          </div>
        )}

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
            const isUrlGroup = !!r.urlGroup;
            const isFavorite = !!r.favorite;
            const title = isUrlGroup
              ? `${r.urlGroup!.urls.length} tabs: ${r.urlGroup!.urls.slice(0, 3).join(", ")}${r.urlGroup!.urls.length > 3 ? "…" : ""}`
              : isFavorite
              ? r.favorite!.pathOrUrl
              : (isCustom && r.path ? r.path : undefined);

            const isExpanded = isUrlGroup && expandedUrlGroups.has(r.urlGroup!.id);

            return (
              <div
                key={`${r.category}:${r.id}`}
                className={[
                  "rounded-md text-left text-sm",
                  active ? "bg-sky-50 text-slate-800 ring-1 ring-sky-200" : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <div className="flex items-center justify-between px-3 py-2" title={title}>
                  <button
                    onClick={() => setSelectedApp(active ? null : (r.label as any))}
                    className="flex min-w-0 flex-1 items-center justify-between focus:outline-none"
                    aria-pressed={active}
                    title={title}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${r.dot}`} />
                      {isUrlGroup && <span className="text-[12px]">🔗</span>}
                      {isFavorite && <span className="text-[12px] text-amber-500">★</span>}
                      <span className="truncate font-medium">{r.label}</span>
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      <span className="text-xs text-slate-500">{r.category}</span>
                      {isCustom && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-slate-200">
                          Custom
                        </span>
                      )}
                      {isUrlGroup && (
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] text-cyan-700 ring-1 ring-cyan-200">
                          {r.urlGroup!.urls.length} URL{r.urlGroup!.urls.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {isFavorite && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 ring-1 ring-amber-200">
                          Favorite
                        </span>
                      )}
                    </div>
                  </button>

                  {/* URL Group expand/collapse chevron — lets the user view
                      every URL the group will open, so duplicates across
                      groups can be spotted before assigning. stopPropagation
                      so the click doesn't toggle the row's selection. */}
                  {isUrlGroup && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleUrlGroupExpanded(r.urlGroup!.id); }}
                      className={[
                        "ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs leading-none transition-transform duration-150",
                        isExpanded
                          ? "rotate-90 border-cyan-300 bg-cyan-50 text-cyan-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                      ].join(" ")}
                      title={isExpanded ? "Hide URLs in this group" : "Show URLs in this group"}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? "Collapse URLs" : "Expand URLs"}
                    >
                      ▸
                    </button>
                  )}

                  {editMode && (isCustom || isUrlGroup || isFavorite) ? (
                    <GhostBtn onClick={() => onDeleteCustom(r)} className="ml-2 h-7 whitespace-nowrap px-2">
                      🗑 Delete
                    </GhostBtn>
                  ) : editMode && r.seedId && !r.isHiddenSeed ? (
                    <GhostBtn
                      onClick={() => onHideSeed(r)}
                      className="ml-2 h-7 whitespace-nowrap px-2"
                      title={`Hide "${r.label}" from this list. Use "Show N hidden" below to bring it back. The catalog entry is preserved.`}
                    >
                      👁 Hide
                    </GhostBtn>
                  ) : editMode && r.seedId && r.isHiddenSeed ? (
                    <GhostBtn
                      onClick={() => onShowSeed(r)}
                      className="ml-2 h-7 whitespace-nowrap border-emerald-200 bg-emerald-50 px-2 text-emerald-700 hover:bg-emerald-100"
                      title={`Restore "${r.label}" to the list.`}
                    >
                      ↺ Restore
                    </GhostBtn>
                  ) : r.isHiddenSeed ? (
                    <span className="ml-2 inline-flex h-7 items-center rounded-full bg-slate-200 px-2 text-[10px] italic text-slate-600">
                      hidden
                    </span>
                  ) : (
                    <div className="h-7 w-[64px]" />
                  )}
                </div>

                {/* Expanded URL list — shown only when the chevron is open.
                    Read-only inline view of every URL the group will open,
                    with the group NAME as a prominent header (so users can
                    tell which group they're looking at when multiple panels
                    are expanded and the row header has scrolled out of
                    view), browser name on the next line, then the URLs.
                    Click a URL to copy. */}
                {isUrlGroup && isExpanded && (
                  <div className="border-t border-cyan-200 bg-cyan-50/40 px-3 py-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-cyan-900">
                      <span aria-hidden>🔗</span>
                      <span className="truncate" title={r.urlGroup!.name}>{r.urlGroup!.name}</span>
                    </div>
                    <div className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                      Browser: <span className="font-mono text-cyan-700">{r.urlGroup!.browser}</span>
                      <span className="ml-2 text-slate-400">• {r.urlGroup!.urls.length} URL{r.urlGroup!.urls.length === 1 ? "" : "s"}</span>
                    </div>
                    {r.urlGroup!.urls.length === 0 ? (
                      <div className="text-[11px] italic text-slate-400">(empty group)</div>
                    ) : (
                      <ol className="space-y-1">
                        {r.urlGroup!.urls.map((u, i) => (
                          <li key={`${r.urlGroup!.id}-${i}`} className="flex items-baseline gap-2">
                            <span className="shrink-0 select-none text-[10px] font-mono text-slate-400">{i + 1}.</span>
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left text-[11px] text-slate-700 hover:text-cyan-700"
                              title={`Click to copy: ${u}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                try { navigator.clipboard.writeText(u); } catch {}
                              }}
                            >
                              {u}
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-slate-500">No apps match your search.</div>
          )}
        </div>

        {/* Hidden-seeds toggle row — visible only when there are hidden
            catalog apps to manage. Reveals them inline in the list above
            (with "hidden" pills, and a "Restore" button when Edit is on)
            so the user can bring back any they want. */}
        {hiddenSeedIds.size > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 px-2 pt-2">
            <button
              type="button"
              onClick={() => setRevealHidden((v) => !v)}
              className="text-[11px] text-slate-600 hover:text-slate-900"
              title={revealHidden
                ? "Hide the hidden-seed entries again — they remain hidden by default."
                : "Reveal the hidden catalog seeds inline. Turn on Edit to Restore individual ones."}
            >
              {revealHidden ? "▾ Hide" : "▸ Show"} {hiddenSeedIds.size} hidden app{hiddenSeedIds.size === 1 ? "" : "s"}
            </button>
            {editMode && revealHidden && (
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Restore all ${hiddenSeedIds.size} hidden apps to the list?`)) return;
                  onShowAllHiddenSeeds();
                }}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
              >
                ↺ Restore all
              </button>
            )}
          </div>
        )}
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
    if (!snap.browser) {
      showFlash("Pick a browser first.");
      return;
    }
    const created: string[] = [];
    const errors: string[] = [];
    for (const tg of snap.tabGroups) {
      const urls = tg.urls.filter(Boolean);
      if (urls.length === 0) continue;
      const name = tg.title.trim() || `Tabs ${created.length + 1}`;
      try {
        addUrlGroup({ name, browser: snap.browser, urls });
        created.push(name);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    if (created.length === 0) {
      showFlash(errors[0] ?? "Add at least one URL to a tab group before saving.");
      return;
    }
    // Notify the Apps list (and anywhere else) so URL groups appear immediately.
    window.dispatchEvent(new CustomEvent("insta:url-groups-changed"));
    showFlash(
      `Saved ${created.length} URL group${created.length === 1 ? "" : "s"}: ${created.join(", ")}. Pick from App History to assign.`
    );
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
    window.dispatchEvent(new CustomEvent("insta:favorites-changed"));
  };
  const onAdded = () => {
    setFavorites(listFavorites());
    // AddFavoriteModal already broadcasts on save; this is a defensive
    // belt-and-suspenders for when other code paths add a favorite.
    window.dispatchEvent(new CustomEvent("insta:favorites-changed"));
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
  title,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
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

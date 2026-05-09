// Persistence for "URL groups" — named bundles of (browser + URL list) that
// the user configures via the Apps → URLs builder and then assigns to grid
// cells like a regular app. When applied, each URL group spawns one browser
// window with its URLs loaded as tabs.
import { safeGet, safeSet } from "./storage";

export type UrlGroup = {
  id: string;
  name: string;        // user-chosen label, e.g. "Research"
  browser: string;     // catalog id: "Chrome" | "Edge" | "Firefox" | "Brave"
  urls: string[];      // browser tabs to open in the new window
  createdAt: number;
};

const KEY = "insta.urlgroups.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return "ug_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(): UrlGroup[] {
  return safeGet<UrlGroup[]>(KEY, []);
}
function save(list: UrlGroup[]) {
  safeSet(KEY, list);
}

/** Newest-first list. */
export function listUrlGroups(): UrlGroup[] {
  return [...load()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Add a URL group. De-dupes by (name, browser); updates URLs if the pair exists. */
export function addUrlGroup(input: { name: string; browser: string; urls: string[] }): UrlGroup {
  const name = input.name.trim();
  const browser = input.browser.trim();
  const urls = input.urls.map(u => u.trim()).filter(Boolean);
  if (!name || !browser) throw new Error("URL group needs both a name and a browser.");
  if (urls.length === 0) throw new Error("URL group needs at least one URL.");

  const list = load();
  const existing = list.find(g => g.name.toLowerCase() === name.toLowerCase() && g.browser === browser);
  if (existing) {
    existing.urls = urls;
    existing.createdAt = Date.now();
    save(list);
    return existing;
  }
  const item: UrlGroup = { id: uuid(), name, browser, urls, createdAt: Date.now() };
  list.push(item);
  save(list);
  return item;
}

export function removeUrlGroup(id: string): void {
  save(load().filter(g => g.id !== id));
}

export function clearUrlGroups(): void {
  save([]);
}

/** Look up a URL group by its display name (case-insensitive). Used by
 *  layoutBuilder.resolveAppTarget when an assignment's title matches a URL
 *  group instead of a plain app catalog entry. */
export function findUrlGroupByName(name: string): UrlGroup | null {
  const lc = name.toLowerCase();
  return load().find(g => g.name.toLowerCase() === lc) ?? null;
}

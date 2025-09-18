// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\services\AppsHistoryService.ts
import { safeGet, safeSet } from "./storage";

export type AppHistoryItem = {
  id: string;
  title: string;
  path: string;      // Full executable/link/batch path
  createdAt: number;
};

const KEY = "insta.history.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return "hist_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(): AppHistoryItem[] {
  return safeGet<AppHistoryItem[]>(KEY, []);
}
function save(list: AppHistoryItem[]) {
  safeSet(KEY, list);
}

/** Return newest-first list. */
export function listHistory(): AppHistoryItem[] {
  return [...load()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Add (de-dupe by path, update title if changed). Returns the item. */
export function addHistory(input: { title: string; path: string }): AppHistoryItem {
  const title = input.title.trim();
  const path = input.path.trim();
  const list = load();
  const existing = list.find((i) => i.path.toLowerCase() === path.toLowerCase());
  if (existing) {
    existing.title = title || existing.title;
    existing.createdAt = Date.now();
    save(list);
    return existing;
  }
  const item: AppHistoryItem = { id: uuid(), title: title || path, path, createdAt: Date.now() };
  list.push(item);
  save(list);
  return item;
}

export function removeHistory(id: string): void {
  save(load().filter((i) => i.id !== id));
}

export function clearHistory(): void {
  save([]);
}

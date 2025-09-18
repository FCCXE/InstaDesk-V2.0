// C:\FcXe Studios\Instadesk\instadesk-tauri\ui\src\services\FavoritesService.ts
import { safeGet, safeSet } from "./storage";

export type FavoriteKind = "app" | "url";
export type Favorite = {
  id: string;
  kind: FavoriteKind;
  title: string;       // Friendly name shown in UI
  pathOrUrl: string;   // Full .exe/.lnk path OR URL
  icon?: string;       // Optional emoji
  createdAt: number;
};

const KEY = "insta.favorites.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  // Fallback
  return "fav_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadRaw(): Favorite[] {
  return safeGet<Favorite[]>(KEY, []);
}
function saveRaw(list: Favorite[]): void {
  safeSet(KEY, list);
}

export function listFavorites(): Favorite[] {
  return loadRaw();
}

export function addFavorite(input: {
  kind: FavoriteKind;
  title: string;
  pathOrUrl: string;
  icon?: string;
}): Favorite {
  const item: Favorite = {
    id: uuid(),
    kind: input.kind,
    title: input.title.trim(),
    pathOrUrl: input.pathOrUrl.trim(),
    icon: input.icon ?? seedEmoji(input.title),
    createdAt: Date.now(),
  };
  const list = loadRaw();
  list.push(item);
  saveRaw(list);
  return item;
}

export function removeFavorite(id: string): void {
  const list = loadRaw().filter((f) => f.id !== id);
  saveRaw(list);
}

export function updateFavorite(id: string, patch: Partial<Favorite>): Favorite | null {
  const list = loadRaw();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  const next = { ...list[idx], ...patch };
  list[idx] = next;
  saveRaw(list);
  return next;
}

export function clearFavorites(): void {
  saveRaw([]);
}

/* ---------------------- Deterministic emoji from title --------------------- */
const EMOJIS = [
  "📧","🌐","🧩","📝","🐙","🗂️","🖥️","⚙️","📁","📎",
  "📚","🧠","🔧","🚀","🗒️","💡","🧭","📊","🔐","🛠️",
];

export function seedEmoji(input: string): string {
  const s = (input || "x").toLowerCase().trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return EMOJIS[h % EMOJIS.length];
}

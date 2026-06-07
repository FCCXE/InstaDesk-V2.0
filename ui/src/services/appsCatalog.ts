// Shared app catalog. Single source of truth for the app rows shown in
// "Apps → Apps" and the colored cell rendering in the workspace grid.
//
// `program` paths are best-effort Windows install defaults. They're
// expanded server-side via os.path.expandvars so %LOCALAPPDATA% etc.
// resolve at launch time. If a default doesn't match the user's
// machine, Browse... in the Apps tab adds a Custom history row whose
// path WINS over the catalog default (see resolveAppTarget priority).

export type AppCatalogEntry = {
  id: string;            // canonical label (also used as assignment key)
  category: string;
  dot: string;           // tailwind background class for the colored dot
  fill: string;          // tailwind background class for filled grid cells
  ring: string;          // tailwind border class for filled grid cells
  program?: string;      // resolvable exe path
  url?: string;          // or a URL routed through default browser
  args?: string;         // extra CLI flags (e.g. "--new-window" so single-
                         //   instance apps spawn a NEW window the agent can tile)
  singleInstance?: boolean;  // when true, the launcher signals the existing
                         //   instance (no new window is created). The agent
                         //   tiles the existing window and skips Process.Start.
                         //   Multi-instance apps (Notepad, browsers via --new-window,
                         //   File Explorer, Office) leave this unset so each
                         //   apply produces a brand-new window.
};

export const APP_CATALOG: AppCatalogEntry[] = [
  { id: "Notepad", category: "Text", dot: "bg-slate-400", fill: "bg-slate-100", ring: "border-slate-400",
    program: "C:\\Windows\\System32\\notepad.exe" },
  // File Explorer differentiates instances by the target folder path passed
  // as an argument. Use the per-cell args override (Apps tab) to set e.g.
  // "C:\Downloads" on one region and "D:\Projects" on another — same app,
  // two distinct windows that the agent can tile independently.
  { id: "File Explorer", category: "System", dot: "bg-yellow-500", fill: "bg-yellow-50", ring: "border-yellow-500",
    program: "C:\\Windows\\explorer.exe" },
  { id: "Outlook", category: "Communication", dot: "bg-emerald-500", fill: "bg-emerald-50", ring: "border-emerald-500",
    program: "%ProgramFiles%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE", singleInstance: true },
  { id: "Chrome",  category: "Browser",       dot: "bg-sky-500",     fill: "bg-sky-50",     ring: "border-sky-500",
    program: "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe", args: "--new-window" },
  { id: "VS Code", category: "Development",   dot: "bg-violet-500",  fill: "bg-violet-50",  ring: "border-violet-500",
    program: "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe", args: "--new-window" },
  { id: "GitHub",  category: "Development",   dot: "bg-indigo-500",  fill: "bg-indigo-50",  ring: "border-indigo-500",
    url: "https://github.com" },
  { id: "Stack Overflow", category: "Development", dot: "bg-amber-500",  fill: "bg-amber-50",  ring: "border-amber-500",
    url: "https://stackoverflow.com" },
  { id: "Slack",   category: "Communication",  dot: "bg-fuchsia-500", fill: "bg-fuchsia-50", ring: "border-fuchsia-500",
    program: "%LOCALAPPDATA%\\slack\\slack.exe" },
  { id: "Teams",   category: "Communication",  dot: "bg-purple-500",  fill: "bg-purple-50",  ring: "border-purple-500",
    program: "%LOCALAPPDATA%\\Microsoft\\Teams\\current\\Teams.exe", singleInstance: true },
  { id: "Zoom",    category: "Communication",  dot: "bg-blue-500",    fill: "bg-blue-50",    ring: "border-blue-500",
    program: "%APPDATA%\\Zoom\\bin\\Zoom.exe" },
  { id: "Edge",    category: "Browser",        dot: "bg-cyan-500",    fill: "bg-cyan-50",    ring: "border-cyan-500",
    program: "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe", args: "--new-window" },
  { id: "Firefox", category: "Browser",        dot: "bg-orange-500",  fill: "bg-orange-50",  ring: "border-orange-500",
    program: "%ProgramFiles%\\Mozilla Firefox\\firefox.exe", args: "-new-window" },
  { id: "Brave",   category: "Browser",        dot: "bg-amber-600",   fill: "bg-amber-50",   ring: "border-amber-600",
    program: "%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", args: "--new-window" },
  { id: "Figma",   category: "Design",         dot: "bg-pink-500",    fill: "bg-pink-50",    ring: "border-pink-500",
    program: "%LOCALAPPDATA%\\Figma\\Figma.exe" },
  { id: "Photoshop", category: "Design",       dot: "bg-blue-600",    fill: "bg-blue-50",    ring: "border-blue-600" },
  { id: "Illustrator", category: "Design",     dot: "bg-amber-700",   fill: "bg-amber-50",   ring: "border-amber-700" },
  { id: "Word",    category: "Office",         dot: "bg-sky-600",     fill: "bg-sky-50",     ring: "border-sky-600",
    program: "%ProgramFiles%\\Microsoft Office\\root\\Office16\\WINWORD.EXE" },
  { id: "Excel",   category: "Office",         dot: "bg-green-600",   fill: "bg-green-50",   ring: "border-green-600",
    program: "%ProgramFiles%\\Microsoft Office\\root\\Office16\\EXCEL.EXE" },
  { id: "PowerPoint", category: "Office",      dot: "bg-red-500",     fill: "bg-red-50",     ring: "border-red-500",
    program: "%ProgramFiles%\\Microsoft Office\\root\\Office16\\POWERPNT.EXE" },
  { id: "Postman", category: "Development",    dot: "bg-orange-600",  fill: "bg-orange-50",  ring: "border-orange-600",
    program: "%LOCALAPPDATA%\\Postman\\Postman.exe" },
  { id: "Docker",  category: "Development",    dot: "bg-sky-700",     fill: "bg-sky-50",     ring: "border-sky-700",
    program: "%ProgramFiles%\\Docker\\Docker\\Docker Desktop.exe" },
];

// Fallback styling for Custom apps (added via Browse...) and any unknown id.
export const CUSTOM_APP_STYLE = {
  dot: "bg-slate-500",
  fill: "bg-slate-100",
  ring: "border-slate-500",
};

const _byId = new Map(APP_CATALOG.map(e => [e.id, e]));

export function lookupAppStyle(id: string | null | undefined) {
  if (!id) return null;
  const seed = _byId.get(id);
  if (seed) return { dot: seed.dot, fill: seed.fill, ring: seed.ring };
  return CUSTOM_APP_STYLE;
}

// ---------------------------------------------------------------------------
// Instance shade palette
// ---------------------------------------------------------------------------
// When two or more regions of the same app live on the same monitor
// (differentiated by per-cell args override — e.g., two File Explorer
// windows pointed at different folders), each instance gets a distinct
// shade within the app's color family so the user can SEE the difference
// at a glance. Single-instance apps keep their original color (no change).
//
// Tailwind v4's class scanner requires every utility class to appear as a
// literal in source — we cannot template strings like `bg-${color}-${n}`.
// So this map enumerates the shade ladder per color family explicitly.
// Add a new family here whenever you add an app whose base color isn't
// already represented.

export type ShadePair = { fill: string; ring: string };

const SHADE_LADDERS: Record<string, ShadePair[]> = {
  yellow:   [
    { fill: "bg-yellow-50",     ring: "border-yellow-500" },
    { fill: "bg-yellow-100",    ring: "border-yellow-600" },
    { fill: "bg-yellow-200",    ring: "border-yellow-700" },
    { fill: "bg-yellow-300",    ring: "border-yellow-800" },
  ],
  slate:    [
    { fill: "bg-slate-100",     ring: "border-slate-400" },
    { fill: "bg-slate-200",     ring: "border-slate-600" },
    { fill: "bg-slate-300",     ring: "border-slate-700" },
    { fill: "bg-slate-400",     ring: "border-slate-800" },
  ],
  emerald:  [
    { fill: "bg-emerald-50",    ring: "border-emerald-500" },
    { fill: "bg-emerald-100",   ring: "border-emerald-600" },
    { fill: "bg-emerald-200",   ring: "border-emerald-700" },
    { fill: "bg-emerald-300",   ring: "border-emerald-800" },
  ],
  sky:      [
    { fill: "bg-sky-50",        ring: "border-sky-500" },
    { fill: "bg-sky-100",       ring: "border-sky-600" },
    { fill: "bg-sky-200",       ring: "border-sky-700" },
    { fill: "bg-sky-300",       ring: "border-sky-800" },
  ],
  violet:   [
    { fill: "bg-violet-50",     ring: "border-violet-500" },
    { fill: "bg-violet-100",    ring: "border-violet-600" },
    { fill: "bg-violet-200",    ring: "border-violet-700" },
    { fill: "bg-violet-300",    ring: "border-violet-800" },
  ],
  indigo:   [
    { fill: "bg-indigo-50",     ring: "border-indigo-500" },
    { fill: "bg-indigo-100",    ring: "border-indigo-600" },
    { fill: "bg-indigo-200",    ring: "border-indigo-700" },
    { fill: "bg-indigo-300",    ring: "border-indigo-800" },
  ],
  amber:    [
    { fill: "bg-amber-50",      ring: "border-amber-500" },
    { fill: "bg-amber-100",     ring: "border-amber-600" },
    { fill: "bg-amber-200",     ring: "border-amber-700" },
    { fill: "bg-amber-300",     ring: "border-amber-800" },
  ],
  fuchsia:  [
    { fill: "bg-fuchsia-50",    ring: "border-fuchsia-500" },
    { fill: "bg-fuchsia-100",   ring: "border-fuchsia-600" },
    { fill: "bg-fuchsia-200",   ring: "border-fuchsia-700" },
    { fill: "bg-fuchsia-300",   ring: "border-fuchsia-800" },
  ],
  purple:   [
    { fill: "bg-purple-50",     ring: "border-purple-500" },
    { fill: "bg-purple-100",    ring: "border-purple-600" },
    { fill: "bg-purple-200",    ring: "border-purple-700" },
    { fill: "bg-purple-300",    ring: "border-purple-800" },
  ],
  blue:     [
    { fill: "bg-blue-50",       ring: "border-blue-500" },
    { fill: "bg-blue-100",      ring: "border-blue-600" },
    { fill: "bg-blue-200",      ring: "border-blue-700" },
    { fill: "bg-blue-300",      ring: "border-blue-800" },
  ],
  cyan:     [
    { fill: "bg-cyan-50",       ring: "border-cyan-500" },
    { fill: "bg-cyan-100",      ring: "border-cyan-600" },
    { fill: "bg-cyan-200",      ring: "border-cyan-700" },
    { fill: "bg-cyan-300",      ring: "border-cyan-800" },
  ],
  orange:   [
    { fill: "bg-orange-50",     ring: "border-orange-500" },
    { fill: "bg-orange-100",    ring: "border-orange-600" },
    { fill: "bg-orange-200",    ring: "border-orange-700" },
    { fill: "bg-orange-300",    ring: "border-orange-800" },
  ],
  pink:     [
    { fill: "bg-pink-50",       ring: "border-pink-500" },
    { fill: "bg-pink-100",      ring: "border-pink-600" },
    { fill: "bg-pink-200",      ring: "border-pink-700" },
    { fill: "bg-pink-300",      ring: "border-pink-800" },
  ],
  red:      [
    { fill: "bg-red-50",        ring: "border-red-500" },
    { fill: "bg-red-100",       ring: "border-red-600" },
    { fill: "bg-red-200",       ring: "border-red-700" },
    { fill: "bg-red-300",       ring: "border-red-800" },
  ],
  green:    [
    { fill: "bg-green-50",      ring: "border-green-500" },
    { fill: "bg-green-100",     ring: "border-green-600" },
    { fill: "bg-green-200",     ring: "border-green-700" },
    { fill: "bg-green-300",     ring: "border-green-800" },
  ],
};

// Extract the family name (e.g., "yellow") from a base Tailwind class
// like "bg-yellow-50" or "border-yellow-500". Returns null when the
// pattern doesn't match — callers should fall back to the base style.
function familyOf(klass: string): string | null {
  const m = klass.match(/^(?:bg|border)-([a-z]+)-\d+$/);
  return m ? m[1] : null;
}

/** Pick a fill/ring pair for a given (app id, 0-based instanceIndex).
 *  instanceIndex 0 returns the catalog's base style — exact same colors
 *  as today for single-instance layouts (no visual regression). Higher
 *  instance indices return progressively darker variants from the
 *  family's shade ladder; beyond the ladder length (rare in practice)
 *  it clamps to the darkest entry. */
export function instanceStyleFor(
  id: string | null | undefined,
  instanceIndex: number,
): ShadePair & { dot: string } {
  const base = lookupAppStyle(id);
  if (!base) {
    return { dot: CUSTOM_APP_STYLE.dot, fill: CUSTOM_APP_STYLE.fill, ring: CUSTOM_APP_STYLE.ring };
  }
  if (instanceIndex <= 0) {
    return { dot: base.dot, fill: base.fill, ring: base.ring };
  }
  // Prefer the family resolved from the fill class. If that fails (custom
  // pattern, foreign family), try the ring class. Otherwise stay on base.
  const family = familyOf(base.fill) ?? familyOf(base.ring);
  if (!family) return { dot: base.dot, fill: base.fill, ring: base.ring };
  const ladder = SHADE_LADDERS[family];
  if (!ladder || ladder.length === 0) return { dot: base.dot, fill: base.fill, ring: base.ring };
  const clamped = Math.min(instanceIndex, ladder.length - 1);
  const pair = ladder[clamped];
  return { dot: base.dot, fill: pair.fill, ring: pair.ring };
}

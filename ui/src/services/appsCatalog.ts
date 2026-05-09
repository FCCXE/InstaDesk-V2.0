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

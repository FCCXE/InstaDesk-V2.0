// Shared helpers to derive a friendly display name from a file path. Previously
// copy-pasted (identically) across BrowseAppModal / AddFavoriteModal, with a
// near-identical sibling in BrowserPickerModal.

function basename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() || "";
}

/** App/title name from a path: strips a launcher extension. */
export function inferTitle(p: string): string {
  return basename(p).replace(/\.(exe|lnk|bat|cmd)$/i, "").trim() || "Custom App";
}

/** Browser name from an exe path: strips ".exe". */
export function inferBrowserName(p: string): string {
  return basename(p).replace(/\.exe$/i, "").trim() || "Browser";
}

# InstaDesk — wiring audit: features that exist but are not reachable

> Operator-requested 2026-08-27: *"a full deep audit of our app in search of non wired features, like
> the one we just spotted and fixed inside our URL Builder."*
>
> Measured with `ui/scripts/audit-wiring.mjs` at commit `8cdfa72`, then **every candidate opened and
> read**. No code changed.

---

## §1 — The instrument failed twice before it was trusted, and that is the main lesson

The audit's whole value depends on the detector actually finding this class. So before running it on
anything, it was pointed at the commit **where the known defect was still live**
(`pre-remove-openmode`) and required to find `openMode`.

**Version 1 asked "does any component reference this member?"** — and reported a clean bill of health.
The answer for `openMode` was *yes*: `setOpenMode` really was called by the radio's `onChange`, and
`openMode` really was read by `checked={urlBuilder.openMode === "single"}`. **Reachability is not
consumption.**

**Version 2 asked "is it read by anything that acts?"** — and *still* reported nothing, for a
completely different reason: `openMode` was never a member of the context at all. It lived **nested**
inside `urlBuilder`, so no scan of context members could see it however cleverly it classified reads.

**Version 3 starts from the WRITE PATH.** Every `setX` on the context is a promise that some `x` is
worth remembering; derive the field from the setter and ask what ever reads it. That reaches nested
fields, because it never needed the field to be top-level.

> Two detectors in a row certified a codebase with a known dead control in it. **Had this audit been
> run without that control, its headline would have been "no unwired features found".**

A fourth correction followed: the setter→field derivation misfires (`setUrlBrowser` writes `browser`,
not `urlBrowser`), which produced six false positives. Those are now reported separately as **blind
spots** — *"I could not analyse this"* must never be printed as *"this is dead"*.

**Controls, both directions:** at `pre-remove-openmode` probe B flags exactly **1** item, `openMode`.
At HEAD it flags **0**. Positive and negative both pass.

---

## §2 — Results

| Probe | Result |
|---|---|
| **A** — exported, never used elsewhere | **17 candidates** → triaged below |
| **B** — state nothing acts on | **0** |
| **C** — i18n keys no `t()` references | **0** |
| **D** — Rust commands the UI never invokes | **0** |
| *blind spots* | 7 setters whose field name could not be derived |

B, C and D being zero is meaningful rather than empty: B is the probe that catches the `openMode`
class, and it is proven to catch it.

---

## §3 — Findings that matter: capability that exists and cannot be reached

### W-1 — ✅ **FIXED 2026-08-27** — a Favorite can now be edited

Tag `pre-favorite-edit` pushed first. `AddFavoriteModal` gained an `editing` prop: it prefills the
record, **locks the title** (the title is what `findFavoriteByName` resolves against, so renaming is
F-2's cascade again) and **fixes the kind** (swapping app↔url changes *which* field a Layout
snapshots — a different job). The save updates **by id, never by title**.

The edit **propagates to saved Layouts**, field-scoped by kind: `kind:"app"` writes `program`,
`kind:"url"` writes `urls`. That required generalising `DefinitionChange` so **both** value fields are
optional — writing `urls: []` into an app assignment because the caller had none would corrupt it.
Four tests were witnessed red (`TypeError: change.urls is not iterable`) before the change, and one of
them re-asserts that a per-cell `args` override survives whichever field moved. **38 tests green.**

**Confirmed by the instrument that found it:** probe A drops from 17 candidates to 16, with
`updateFavorite` no longer among them.

*(original finding, for the record)*
### W-1 — **A Favorite cannot be edited** *(the same defect you just had fixed for URL groups)*

`FavoritesService.updateFavorite(id, patch)` is written, correct, and **called from nowhere**.
Favorites can be added and deleted; a wrong path or a renamed entry can only be deleted and rebuilt —
**exactly the complaint that opened the URL group front.**

> Note against my own earlier advice: during the URL group work I recommended fixing "the same
> snapshot defect" for Favorites and then **withdrew it**, because a Favorite cannot drift if it
> cannot be edited. That reasoning stands, and this is its other half: the gap is not propagation,
> it is that **editing does not exist at all**.

### W-2 — **Favorites have no "clear all"**

`clearFavorites()` exists and is unreachable. App History has its clear-all wired (`clearHistory` is
called); Favorites does not. An asymmetry between two adjacent lists, not a missing capability in the
engine.

### W-3 — **A clipboard capability with no caller**

`src/services/clipboard.ts` contains exactly one function, `copyText`, and **the entire module is
unreachable**. Whether a copy affordance was removed or never built cannot be told from the code;
what is certain is that nothing can copy anything today.

---

## §4 — Dead code, no user-facing gap

Read and confirmed harmless — worth deleting for clarity, but nothing is missing from the product:

| Symbol | Why it is not a gap |
|---|---|
| `parsePresetIntoCells` | **Superseded** by `parsePresetIntoCellsMulti`, which the Layout edit path actually uses. Legacy single-monitor version. |
| `isHidden` | A convenience wrapper over `listHiddenIds`, which is used directly. |
| `telemetryActive` | Near-duplicate of `telemetryConfigured`, which *is* used. |
| `defaultBinding` | An accessor over `DEFAULTS`, which the module already uses directly at two sites — hotkey defaults do work. |

**Over-exported (8):** `CUSTOM_APP_STYLE`, `lookupAppStyle`, `buildSaveAssignments`,
`EXPORT_FORMAT_VERSION`, `buildExportPayload`, `GRID_ROWS`, `GRID_COLS`, `TOUR_ANCHORS` — each used
only inside its own file. `export` is unnecessary; nothing is missing.

**Test-only (1):** `clearUrlGroups` — legitimate test infrastructure.

---

## §5 — What this audit did NOT cover

Stated so the green result is not read as wider than it is:

- **The Rust and WinAgent surfaces.** Probe D only asks whether the UI invokes each registered
  command; it says nothing about dead code *inside* Rust, or agent verbs nothing calls.
- **Assignment fields the agent may ignore.** `frameMode`, `activate`, `topmost`, `waitReadyMs` are
  written into saved Layouts; whether the agent honours each one was **not** measured. This is the
  same shape as `openMode` and is the most likely place for another instance.
- **Controls that are wired but wrong.** This audit finds things nothing acts on, not things that act
  incorrectly.
- **The 7 blind spots**, listed by the tool, remain unanalysed by probe B.

---

## §6 — Recommendation

1. **W-1, edit a Favorite** — highest value, and the class the operator has now hit twice. The
   service function already exists; the work is a UI affordance, and it is smaller than the URL group
   equivalent because a Favorite is one path or URL, not a list.
2. **W-2, clear all Favorites** — one button; closes the asymmetry with App History.
3. **W-3, the clipboard module** — decide: wire a copy affordance, or delete the module. A capability
   nothing can reach is a maintenance cost with no user.
4. **Sweep the agent-honours-it question** (§5, second bullet). That is where the next `openMode`
   most likely lives, and this audit cannot see it.
5. Deleting the four dead symbols and un-exporting the eight is hygiene, not urgency.

---

*Audited 2026-08-27 against `ui/src` and `src-tauri/src/lib.rs`. Instrument committed as
`ui/scripts/audit-wiring.mjs` so the measurement is reproducible. No code changed.*

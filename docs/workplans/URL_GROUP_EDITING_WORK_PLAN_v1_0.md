# URL Group Editing — work plan v1.0

> **Phase 1.** Authorised by the operator 2026-08-27 on the Phase 0 recommendation: **scope (a),
> edit the URL list, plus a fix for F-1.** Evidence:
> `docs/workplans/URL_GROUPS_EDITABILITY_INVESTIGATION_v1_0.md`.
>
> Operator standing instruction for this front, verbatim in force:
> *"Deep Investigation first, safety roll back points, small verifyable implementation steps, dry runs
> before actual implementations and wiring and real working verification of all changes and
> implementations. That is what we have our Sandbox for."*

---

## §0 — How this plan is used

1. **Consult before acting, update in the same turn after.** Status lives here, not in memory.
2. **One place per fact.** A number stated twice will disagree eventually.
3. **Nothing off-plan.** A mid-flight finding is RECORDED here and left alone unless the operator
   folds it in.
4. **The check is written BEFORE the code it guards, and proven to BITE.** A gate nobody has seen
   fail is not evidence.
5. **Verify, never assume.** A code read is not a measurement, and is labelled as such.

**Rollback point: tag `pre-urlgroup-edit-v1`** (pushed 2026-08-27 at `d83aaf9`; v0.5.0 shipped, all
seven gates green, both repos in sync).

---

## §1 — What is being built

**In scope.** Change the URLs inside an existing URL group — add, remove, reorder, correct — without
deleting and rebuilding it. Plus fix **F-1**, the two-key identity defect, which is live today.

**Out of scope, deliberately.** Renaming a group (F-2: the name is the foreign key that Layouts use;
that is its own front with a data-model decision behind it).

---

## §2 — Governing invariants

| # | Invariant | Why |
|---|---|---|
| U-1 | **No existing URL group may be silently altered or lost.** Every change is explicit or reported. | The whole complaint is about losing configuration work. |
| U-2 | **A group in use by a Layout must keep resolving.** | Assignments reference by name; break that and Layouts fail silently. |
| U-3 | **Never widen scope into rename.** | F-2 is unresolved by design here. |
| U-4 | **Sandbox validation before any promotion**, per `RELEASING.md` §3.5. | Operator standing protocol. |
| U-5 | **No fixture may name `Code.exe`** in either Sandbox data dir. | VS Code hosts this session. |

---

## §3 — The instrument problem, and why I-1 exists

`UrlGroupsService` is **pure logic with zero automated tests** — the UI has **no test runner at all**
(no vitest, no jest; the Rust side has 26 tests, the UI has none). So today there is no mechanical way
to prove F-1, to prove a fix for it, or to stop it regressing.

The operator protocol asks for *real working verification*. For a pure function over an array, that
means a test, not a screenshot. **I-1 installs the instrument, and the instrument itself is accepted
only after a POSITIVE and a NEGATIVE control** — a test that passes when it should, and a test proven
to FAIL when the thing it guards is broken. An instrument nobody has seen fail proves nothing.

---

## §4 — Increments

### I-0 — Setup ✅ **DONE**
Rollback tag `pre-urlgroup-edit-v1` pushed. Phase 0 evidence committed `d83aaf9`.

### I-1 — Install the test instrument ✅ **DONE**
vitest 4.1.11 added to `ui/`; `npm test` wired. `src/services/instrument.test.ts` tests the HARNESS,
not the product.

**POSITIVE control — 4 passed.** The positive control deliberately does *not* assert `true === true`:
it drives the real `UrlGroupsService` through the real `services/storage` (which falls back to a
module-level Map when `window` is absent, so no jsdom is needed), and checks that an id and a
timestamp minted *by the service* come back. That is what proves a test in this repo can SEE
production code rather than a mock of it.

**NEGATIVE control — witnessed RED.** `save(list)` was removed from `addUrlGroup` (a mutation that
still returns a plausible record, so a caller checking only the return value would never notice):

```
FAIL  src/services/instrument.test.ts > reaches the real UrlGroupsService and the real storage fallback
AssertionError: expected [] to have a length of 1 but got +0
FAIL  src/services/instrument.test.ts > removeUrlGroup actually removes, so cleanup in later tests is trustworthy
AssertionError: expected [] to have a length of 1 but got +0
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

Restored **from a file copy, never `git checkout`** (I-5 rule of the Switch programme, which cost a
day's work once). Restore verified three ways: mutation marker absent, `save(list)` present again,
`git diff` clean against HEAD — and then **behaviourally**, 4 passed again. A grep alone would not
have been enough.

### I-2 — MEASURE F-1, no fix ✅ **DONE — F-1 IS PROVEN**
`src/services/UrlGroupsService.test.ts`, run against **unchanged** production code (`git diff` clean
on `UrlGroupsService.ts`, checked before the run):

```
FAIL  F-1 — one name must mean one group > re-saving a name with a DIFFERENT browser replaces it, instead of making a twin
AssertionError: expected [ { …(5) }, { …(5) } ] to have a length of 1 but got 2
FAIL  F-1 — one name must mean one group > the surviving group is the one the user saved LAST
AssertionError: expected 'Chrome' to be 'Edge' // Object.is equality
FAIL  F-1 — one name must mean one group > no saved group is unreachable — every stored group can be resolved by name
AssertionError: expected [ { …(5) } ] to deeply equal []
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 7 passed (10)
```

**F-1 is no longer a code read.** The second failure is the sharpest statement of the harm:
`expected 'Chrome' to be 'Edge'` — the app launches the browser the user believes they changed
*away from*. The third confirms exactly one stored group is unreachable: listed in App History,
launchable by nothing.

**7 passed** alongside — the 4 instrument tests plus 3 guards (update-in-place still works, name
matching stays case-insensitive, distinct names stay distinct). So the suite is not failing
wholesale; only the three assertions that describe F-1 fail, which is what makes them a measurement
rather than noise. **No production code was changed in this increment.**

### I-3 — Fix F-1, one key not two ✅ **DONE** → tag `pre-urlgroup-onekey` *(pushed before the change)*

**Dry run against real stored data, before touching the code.** The Sandbox's saved groups live in
the WebView2 profile at `%LOCALAPPDATA%\com.fcxestudios.instadesk.sandbox\EBWebView\Default\Local
Storage\leveldb` (**not** in the app data dir — that holds only presets, session and window state).
Read-only; the stable app's profile was not opened at all.

The block is **Snappy-compressed**, so this is a *partial* read and is labelled as such rather than
dressed up as a parse: three groups are legible — **News** (eltiempo, cnn, bloomberg),
**Entertainment** (youtube, lookmovie2, animeonsen), **BTC Mining** (braiins, coinwarz). **All names
distinct**, so the collapsing behaviour this increment introduces does not fire on the operator's own
data. That is a *reassuring* reading obtained from an incomplete instrument, so it is not treated as
proof of safety — the legacy-twin test below is what actually covers the case.

**Two changes, both small:**
- `addUrlGroup` de-dupes on **name alone** and now updates the browser as well as the URLs. The name
  is already the identity in saved data (assignments store a name, not an id), so the *de-dupe* was
  the half that disagreed. Teaching the lookup about browsers instead would need every stored
  assignment to start carrying one — a data migration, for no gain.
- `findUrlGroupByName` returns the **most recently saved** match, not the first in insertion order.
  The fix stops NEW twins; it cannot un-create twins already in a user's storage, and those are the
  user's data (U-1: nothing deleted behind their back). So the lookup must be deterministic on data
  it did not create, and "the one I saved last" is the only ordering a user can predict.

**Result: 11 passed, 0 failed.** The four assertions that measured F-1 in I-2 now pass, including
`LEGACY data that already contains twins still resolves deterministically` (`'old'` → `'new'`), and
the seven guards still pass — so the fix did not achieve green by collapsing everything.

**Gate wired:** `prebuild` now runs the seven checks **and** the test suite, so this cannot regress
into a release. Full build verified green: 7 gates + 11 tests + `tsc` + `vite`.

⚠ **Behaviour change that must reach the user in I-6:** re-saving an existing name now replaces that
group *even when the browser differs*. That is the intended cure, but it is destructive, and today
the save message says "Saved" for both create and replace.
The name is ALREADY the identity, because assignments resolve by name (F-2). So the de-dupe must key
on **name alone**, matching the lookup — not the other way round, which would require assignments to
carry the browser.
Consequence, and it must be stated to the user: saving a group whose name already exists now
**replaces** it even if the browser differs. That is correct (it makes changing the browser an edit
instead of a shadow) but it is destructive, so I-6 must report it.
**Done when:** the I-2 test passes, a **dry run** over the existing on-disk groups shows what would
change, and the gate is added to `prebuild`.

### I-4 — `updateUrlGroup(id, patch)` ✅ **DONE**
Tests written first and **witnessed red** — `TypeError: updateUrlGroup is not a function` across 6
tests — before a line of it existed.

Addressed **by id, never by name**. `addUrlGroup` keys on the name and that is right for a *save*,
but an edit is a different act: *"change THIS record"*, not *"change whatever currently answers to
this name"*. Routing an edit through the name would create a new group the moment the name in the
builder drifted — F-1 arriving through a second door.

`name` is deliberately **not** updatable (U-3: rename is F-2's cascade, out of scope), so I-6 must
keep the name field read-only while editing. `browser` **is** updatable — the builder shows a browser
picker, and ignoring a change the user can watch themselves make would be a fresh lie; safe now that
one name means one group. `createdAt` is preserved so an edit does not reshuffle App History under
the user mid-task.

Validation is deliberately identical to `addUrlGroup`'s (empty list refused, blanks trimmed):
**two doors into one store must not disagree about what is valid**, or the rule one of them enforces
is a single edit away from being void. **18 passed.**

### I-5 — Load a saved group back into the builder ✅ **DONE**
Witnessed red first (`groupToDraft is not a function` × 4), then implemented. **22 passed.**

`groupToDraft` projects a saved record into the builder's editable shape. The mapping is deliberately
**faithful** — no padding with blank rows, no normalising, no reordering — because the round trip is
the entire safety property:

> **`saved → draft → saved` must be the identity on the URL list.** Otherwise opening a group and
> saving it *unchanged* would quietly alter the user's data — losing configuration while appearing to
> do nothing, which is the exact complaint this front exists to answer (U-1).

The round-trip test asserts the whole store is byte-identical afterwards, not merely that the URLs
look similar. A second test round-trips URLs carrying **query strings and fragments**, because real
groups are dashboards and consoles (`?tab=usage&range=30d`, `#event-1`) and a mapping that mangled a
query string would corrupt precisely the URLs that matter.

The draft row carries the group's **id**, so I-6's save knows which record to edit without matching
on a name.

New types are named `UrlGroupDraftRow` / `UrlGroupDraft` rather than the obvious `UrlGroup`,
because two types already share that name (D-2). Adding a third would have made it worse.

### I-5 — Load a saved group back into the builder ☐ *not risky*
Without this, "edit" still means "retype from memory". Maps a saved group onto a `UrlBuilderDraft`
(note the two different types both named `UrlGroup` — see §5).
**Dry run first:** a test that round-trips saved → draft → saved and asserts the URLs are identical,
before anything is wired to a button.

### I-6 — Wire the Edit affordance ✅ **CODE DONE** → tag `pre-urlgroup-edit-ui` *(pushed first)*
*Awaiting the I-8 Sandbox checkpoint before it counts as proven.*

- **Edit sits beside Delete** on the App History URL-group row, behind the same `editMode` toggle —
  that is already where a user goes to change a saved thing, and the row stays calm otherwise.
- **`editingUrlGroupId` in AppState is the entire difference between the two save paths**, and it is
  an **id, not a name**: matching on the name would spawn a second group the moment the title in the
  builder drifted — F-1 through a second door.
- **The name field is locked while editing** (`Input` gained a `readOnly` prop), with a tooltip
  saying why. Renaming is F-2's cascade across every Layout that references the old name, so it is
  refused *visibly* rather than accepted and half-applied.
- **An editing banner** names the group and offers Cancel. The builder looks identical whether it is
  composing or editing, and that difference decides whether Save creates or overwrites — so it has to
  be visible, and the way out must not be "guess which button is safe".
- **The record vanishing under an open edit is handled**: if it was deleted in the other pane while
  editing, the save says so and closes the edit, rather than silently re-creating something the user
  chose to remove.
- **The save now reports replacement honestly.** Since the I-3 fix, saving an existing name replaces
  that group even across browsers. "Saved" alone would not say so, so the create path now checks
  `findUrlGroupByName` **before** writing (afterwards the two cases are indistinguishable) and reports
  *Replaced* rather than *Saved*.

### I-7 — EN/ES parity and teach it ✅ **DONE**
11 new strings in **each** locale (640 = 640 leaf keys, parity gate green), including plural forms for
the updated/replaced messages. The `urlsFavorites` Help section now explains where Edit lives and why
the name is fixed.

⚠ **While writing that Help text I found the same section documents D-1's dead control**: *"Open
behaviour decides the shape: one window for everything, one window per group, or a separate window
per address."* The app **always** opens one window. So D-1 is not merely an inert control — it is a
**documented promise the product does not keep**. The false sentence was left in place rather than
quietly edited, because removing a documented capability is the operator's decision, not a tidy-up.

### F-3 — **A saved Layout keeps its OWN copy of a group's URLs** ⛔ *found at the I-8 checkpoint*

**Operator report, 2026-08-27:** added a fourth URL to *News*, saved, applied *Monitor 4 - Basic
Layout* — three tabs opened.

**Measured, not guessed.** The question splits cleanly: did the save drop the URL, or did the launch?

- **The save is fine.** The Sandbox's stored groups contain four News URLs — `eltiempo`,
  `edition.cnn`, `bloomberg`, and the new fourth. Read from the WebView2 write-ahead log, which holds
  recent writes uncompressed, so this one is a *complete* read rather than the partial one in I-3.
- **The Layout is the problem.** `presets/general_A.json` holds:
  `{"title":"News","program":"chrome.exe","args":"--new-window","urls":[eltiempo, cnn, bloomberg]}` —
  **three**, frozen at the moment the Layout was saved.

**A saved Layout is a SNAPSHOT, not a reference.** `layoutBuilder.resolveAppTarget` resolves the
group by name when the grid is turned into assignments, and `presets_save` then persists the resolved
URL list. Editing a group afterwards therefore reaches **no Layout that already exists**.

**Pre-existing, and NOT caused by I-6** — the old delete-and-rebuild workaround hit it too. But I-6 is
what makes it harmful: the app now says *"Updated News — 4 URLs"* and the user reasonably expects the
Layout to open four. **A feature that reports success while achieving nothing the user wanted is worse
than the gap it replaced.**

**Why it cannot be fixed at apply time.** `presets_run(kind, slot, margin_px)` is handed only the
slot; **Rust reads the preset file itself** and launches from it. The UI never sees the assignments on
the way past, and Rust cannot read URL groups — they live in browser localStorage.

**Recommended: propagate on edit.** When a group is edited, patch every saved Layout whose assignment
`title` matches that group's name, and report how many were updated. Feasible and safe:
`presetsList` / `presetsGet` / `presetsSave` are all on the UI's API, and `SavedPreset` is only
`{kind, slot, name, assignments}` — patching `urls` in place inside the existing assignment object
preserves monitor, grid, gridSize and every other field. Needs its own tag, tests first, and a **dry
run that reports what would change before anything is written** (U-1).

*Alternative considered and rejected:* tell the user to re-save each Layout by hand. Honest, but it
makes the user maintain a consistency the app is better placed to keep.

### I-9 — Propagate a definition change across the whole construct ☐ **RISKY** → tag `pre-definition-propagation`

**Operator directive, 2026-08-27:** *"The fix should also traverse into Quick Presets, any change on an
App (URL, etc), should traverse across the whole Layout + Quick preset construct."*

**Finding P-1 — Quick Presets are ALREADY correct, and need no work.** A Quick Preset stores only
`{kind, slot}` **references**, and `quickpresets_run` calls `apply_preset(&kind, &lslot, …)`, which
reads the Layout file fresh at apply time. It never holds a copy. **So the propagation surface is
exactly one layer — the Layout files — and every Quick Preset follows for free.** Verified in
`backend.rs`; to be proven behaviourally at the checkpoint rather than left as a code read.

**Finding P-2 — Favorites have the same defect, unreported.** `FavoritesService` already exports
`updateFavorite(id, patch)`, and `resolveAppTarget` resolves favorites by name exactly as it does URL
groups. So editing a Favorite is snapshotted into Layouts too. `AppsHistoryService` has no update
function (add/remove only), so custom apps cannot drift today.

**Finding P-3 — ⛔ propagation MUST be field-scoped, and this nearly went wrong.** The obvious
implementation is "re-resolve every assignment from its definition". That would **destroy user data**:
the operator's own `general_A.json` contains
`{"args":"VsCode 1 - Monitor 3","program":"…Code.exe","title":"VS Code"}` — and that `args` is a
**per-cell launch-args override they set by hand**, the very feature that lets two VS Code windows
open different folders. Re-resolving would overwrite it with the catalog default.

> **The rule: propagate only the fields the DEFINITION owns; never touch a field the user can set per
> cell.** For a URL group that is `urls` (and `program` when the browser changed). `args`, `monitor`,
> `grid`, `gridSize` and the window flags are the user's and are never written.

**Design.** On a definition edit, walk every saved Layout, patch matching assignments field-scoped,
re-save, and report the count. `presetsList` / `presetsGet` / `presetsSave` are all on the UI API, and
`SavedPreset` is only `{kind, slot, name, assignments}`, so patching in place preserves everything
else.

**Protocol:** tests first and witnessed red; a **dry-run mode that reports what would change and
writes nothing** (U-1); then the write path; then the Sandbox.

**Status ✅ CODE DONE** — tag `pre-definition-propagation` pushed first; witnessed red
(`Cannot find module './propagation'`); **34 tests pass**; 7 gates + `tsc` + `vite` green;
643 = 643 leaf keys.

`planUrlGroupPropagation` is the dry run — it returns exactly the Layouts that *would* change, with
their patched assignments ready to save, and **writes nothing**. Only Layouts that genuinely differ
are re-saved: a no-op write is not harmless, since it rewrites the user's file for nothing and makes
the report claim work that never happened.

Three assertions carry the safety of this increment, and they exist because the obvious
implementation would have violated all three:

- **`args` survives.** `{"title":"VS Code","args":"VsCode 1 - Monitor 3"}` is untouched — the
  per-cell override is never written.
- **Geometry survives.** `monitor`, `grid`, `gridSize` are asserted unchanged; propagation never
  moves a window.
- **The input array is never mutated**, so a dry run cannot be mistaken for a write.

A changed browser reaches the Layout too: the program is re-resolved through `resolveAppTarget`, the
same path a fresh save uses — but **only `program` is taken from it, never `args`**. `program`
absent means *unchanged*, never *clear it*.

The message now distinguishes three outcomes: updated only, updated **and N Layouts refreshed**, and
updated-but-**propagation-failed** — the last says plainly that the Layouts may still open the old
addresses, rather than implying the whole save failed.

### I-8 — OPERATOR CHECKPOINT, installed Sandbox ✅ **PASSED 2026-08-27**
First run FAILED and produced F-3. Re-run after I-9 on build `0.5.0-sb.1787838513810`; operator:
*"Implemented fix works as expected."*
Edit a real group's URLs; confirm the change sticks, the Layout using it still applies, and nothing
else moved.

---

## §5 — Open decisions for the operator

**D-1. The dead "Open behaviour" radios** (found during I-0 investigation). `openMode` —
*Single window / Per tab group / Per URL* — is read by three radio buttons, written by a setter, and
**consumed by nothing**. It is not in the saved `UrlGroup` type, the save path never reads it, and
launch always opens one window with the URLs as tabs. **The control has no effect whatsoever.** A user
who picks "Per URL" gets a single window and is told nothing. Adjacent to the reported problem and
arguably more visible, but NOT in the authorised scope. Fold in, or its own front?

**D-3 CLOSED 2026-08-27 — the NUL byte, and a gate for its whole class.** `layoutBuilder.ts:146` held
a raw `0x00` where the author had written ` `. Replaced with the escape and proven identical at
runtime (`  === String.fromCharCode(0)`, length 3), 0 raw NULs on byte-level read-back, and `grep`
now reads the file as text instead of refusing it as binary.

A gate came first and was **bitten on the real defect** before the fix:
`source bytes: FAIL - src/services/layoutBuilder.ts:146 byte 0x00`. `check-source-bytes.mjs` is now
the **eighth** `prebuild` check. It guards a class that has bitten this codebase twice — this NUL
(invisible since 2026-06-06, and behaviourally correct, which is why nobody noticed) and the heredoc
that ate a regex's `` into literal BACKSPACE bytes, leaving a gate that matched nothing and
reported OK.

**P-2 WITHDRAWN — I was wrong, and checked before building.** I recommended fixing Favorites for the
same snapshot defect on the strength of `updateFavorite` existing. **It has no callers anywhere.**
Favorites cannot be edited through any UI, so the snapshot can never drift and the defect is
unreachable. Building propagation for it would have been machinery for a road that does not go
anywhere. It becomes real only if Favorites ever gain an edit path.

**D-2. Two different types both named `UrlGroup`.** `AppState.tsx:272` is `{id, title, urls}` (a
builder draft row); `UrlGroupsService.ts:7` is `{id, name, browser, urls, createdAt}` (a saved group).
One name, two meanings, resolved only by import scope. It compiles, and it is a trap for exactly the
mapping work I-5 does. Rename one?

**D-3. The parked NUL byte** in `layoutBuilder.ts:146` (Phase 0 §4). One-character fix, still
unaddressed.

---

## §6 — Amendment log

| Date | Entry |
|---|---|
| 2026-08-27 | Plan created. Scope authorised: URL-list editing + F-1. Rollback tag `pre-urlgroup-edit-v1` pushed BEFORE any work, per the operator's standing protocol. |
| 2026-08-27 | **Deep investigation found three things the reported symptom did not mention:** the UI has **no test runner at all** (so F-1 could not be proven — hence I-1); `openMode` is a **dead control** (D-1); and **two distinct types share the name `UrlGroup`** (D-2). Recorded, not acted on. |

---

*Consult before acting. Update in the same turn after. Nothing happens off-plan.*

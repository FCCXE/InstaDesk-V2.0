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

### I-4 — `updateUrlGroup(id, patch)` ☐ *not risky*
Update by **id**, never by name. Tests first, including: unknown id is a no-op, an empty URL list is
refused (matching `addUrlGroup`), and `id` and `createdAt` survive.

### I-5 — Load a saved group back into the builder ☐ *not risky*
Without this, "edit" still means "retype from memory". Maps a saved group onto a `UrlBuilderDraft`
(note the two different types both named `UrlGroup` — see §5).
**Dry run first:** a test that round-trips saved → draft → saved and asserts the URLs are identical,
before anything is wired to a button.

### I-6 — Wire the Edit affordance ☐ **RISKY** → tag `pre-urlgroup-edit-ui`
An Edit control on the App History URL-group row, beside delete. Entering edit loads the group; saving
calls `updateUrlGroup` **by id**. The save message must distinguish **updated** from **created**
(today both say "Saved").
**Done when:** proven in the **installed Sandbox**, not in dev.

### I-7 — EN/ES parity and teach it ☐ *not risky*
New strings in both locales. A capability nobody is told about is not delivered — that is the
discoverability audit's finding, and it applies here too: a Help entry, and a tour step if it earns
one.

### I-8 — OPERATOR CHECKPOINT, installed Sandbox ☐
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

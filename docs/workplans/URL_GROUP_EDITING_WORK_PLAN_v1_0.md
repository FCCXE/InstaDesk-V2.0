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

### I-1 — Install the test instrument ☐ *not risky*
Add vitest to `ui/`. Prove it with **both** controls: a test that passes, and a deliberately broken
test observed to FAIL and then removed. Wire `npm test`. **Not** added to `prebuild` yet — that
happens in I-3, once there is something worth gating.
**Done when:** a green run *and* a witnessed red run are both recorded here.

### I-2 — MEASURE F-1, no fix ☐ *not risky*
Tests against the REAL `UrlGroupsService` that reproduce the shadow group: add Dashboards/Chrome, add
Dashboards/Edge, assert what `findUrlGroupByName` returns and that the other record is unreachable.
**Expected: this test FAILS**, and that failure is the measurement that turns F-1 from a code read
into a proven defect.
**Done when:** the failing output is pasted into this plan. **No production code changes.**

### I-3 — Fix F-1, one key not two ☐ **RISKY** → tag `pre-urlgroup-onekey`
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

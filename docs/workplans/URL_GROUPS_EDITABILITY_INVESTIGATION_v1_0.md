# URL Groups - editability investigation (Phase 0 evidence)

> Operator-reported, 2026-08-27: *"there is no way to individually edit already conformed URL TAB
> groups. You either delete them, or use them as they were configured."*
>
> Read from source at commit `da888d3`. **No code changed.** This document is evidence only; the
> design question in section 5 is the operator's to settle before any work plan exists.

---

## 1 - The report is correct

`ui/src/services/UrlGroupsService.ts` is 73 lines and exports its entire surface:

| Function | Does |
|---|---|
| `listUrlGroups()` | read |
| `addUrlGroup({name, browser, urls})` | create **or silently overwrite** - see section 2 |
| `removeUrlGroup(id)` | delete one |
| `clearUrlGroups()` | delete all |
| `findUrlGroupByName(name)` | resolve at launch time |

**There is no update function.** The UI matches: `RightPane.tsx` calls `addUrlGroup` (line 849, from
the URL Builder's Save) and `removeUrlGroup` (line 411, from the App History row's delete). Nothing
else. An App History row for a URL group expands to *view* its URLs and offers *delete*. That is the
whole vocabulary.

---

## 2 - There IS a hidden overwrite path, and it is worse than having none

`addUrlGroup` de-dupes on **(name, browser)**, case-insensitive on the name:

```ts
const existing = list.find(g => g.name.toLowerCase() === name.toLowerCase() && g.browser === browser);
if (existing) { existing.urls = urls; existing.createdAt = Date.now(); save(list); return existing; }
```

So a group *can* be changed: go to the URL Builder and re-enter it with the **exact same name and the
same browser**. Three reasons this is not an answer:

1. **Nothing says so.** No label, no hint, no tour step, no Help entry. It is discoverable only by
   reading the source.
2. **It replaces the whole list.** `existing.urls = urls` - there is no add-one, remove-one or
   reorder. To change the second of five URLs you retype all five.
3. **There is nothing to retype *from*.** The builder draft is
   `useState<UrlBuilderDraft>({ browser: null, tabGroups: [newGroup(1), newGroup(2)], openMode: 'single' })`
   - plain in-memory state, **never persisted**. Restart the app and what you built is gone. The saved
   group is the only copy, and it cannot be loaded back into the builder.

The confirmation message is at least honest - *"Saved N URL group(s)"*, not *"Created"* - so an
overwrite is not actively misreported. It is simply indistinguishable from a create.

---

## 3 - Two latent defects found while reading

### F-1 - Identity is keyed two different ways [read from source, NOT yet measured]

`addUrlGroup` de-dupes on **(name, browser)**. But `findUrlGroupByName` - the function that resolves a
grid assignment to a group when a Layout is applied - matches on **name alone**:

```ts
return load().find(g => g.name.toLowerCase() === lc) ?? null;
```

Two different keys for one identity. The consequence follows directly:

- Create **"Dashboards"** on Chrome. Create **"Dashboards"** on Edge.
- Different browser, so the de-dupe does **not** fire: two records now share one name.
- `findUrlGroupByName("Dashboards")` returns whichever `load()` yields **first** - insertion order.
- The other group is **permanently unreachable** by any Layout, while still visible in App History.

**This means changing a group's browser is not an edit at all - it silently creates a shadow group.**

> WARNING: this is a **code read, not a measurement**. Cheap way to settle it: in the Sandbox, create
> two groups with the same name and different browsers, assign that name to a cell, apply, and see
> which browser opens. Until that is run, treat F-1 as *strongly indicated*, not proven.

### F-2 - The name is the foreign key, so rename is a cascade

`layoutBuilder.resolveAppTarget(app)` is handed the assignment's **app name string** and calls
`findUrlGroupByName(app)`. Assignments therefore store the group's **name**, not its `id`.

Renaming a group would orphan **every saved Layout and Quick Preset that references the old name** -
silently, because a name that resolves to nothing simply falls through the URL-group branch. Any
rename feature has to rewrite those references, or refuse.

This is the same shape as defect A from the Switch programme: the grid cannot represent everything a
Layout holds, and the parts it cannot see get dropped without a word.

---

## 4 - Parked, unrelated, pre-existing

`ui/src/services/layoutBuilder.ts` line 146 contains a **literal NUL byte (0x00)** inside a template
literal. The comment directly above it shows the key as app, an escaped zero, then args - the author
wrote the escape and it was eaten at authoring time (commit `296b9f9`, 2026-06-06, long before this
programme).

It is **behaviourally correct** - a literal NUL and the escape produce the same string - which is
exactly why nothing has ever complained. The costs are real but indirect: `grep` classifies the file
as binary and refuses to search it without `-a` (this happened twice during this investigation), diffs
and editors may mangle it, and **any tool that strips control characters would silently collapse the
region grouping key** - merging two regions that must stay distinct, i.e. resurrecting the
two-windows-of-one-app defect.

**Not fixed here** (off the reported scope). One-character change.

---

## 5 - The question the operator must settle before a plan exists

"Edit a URL group" has three possible scopes, and they are not the same job:

**(a) Edit the URL list only** - add, remove, reorder, correct a URL. Needs an `updateUrlGroup(id, urls)`
and a way to load an existing group back into the builder. Touches nothing outside the group. F-2 does
not apply. This is the narrow reading and the one the screenshot suggests.

**(b) Also rename** - requires resolving F-2: either rewrite every referencing assignment, or key
assignments by `id` instead of name (a data migration), or refuse the rename when the group is in use
and say so.

**(c) Also change the browser** - requires resolving F-1 first, or the "edit" quietly creates a shadow
group. Arguably F-1 should be fixed regardless, since it is reachable today without any edit feature.

---

## 6 - Recommendation

**Scope (a) plus a fix for F-1.** (a) is what was actually reported, is self-contained, and is the
majority of the value. F-1 is a defect that exists *now*, independent of any edit feature, and it is
cheap to fix - make `findUrlGroupByName` and the de-dupe agree on one key. (b) is a genuine feature
with a data-model decision behind it and deserves its own front rather than being smuggled in.

Whatever the scope, the builder must be able to **load an existing group**, or "edit" remains "retype
from memory".

---

*Investigated 2026-08-27 against UrlGroupsService.ts, layoutBuilder.ts, RightPane.tsx and
AppState.tsx. No code was changed.*

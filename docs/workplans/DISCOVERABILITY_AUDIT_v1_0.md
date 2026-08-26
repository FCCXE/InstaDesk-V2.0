# InstaDesk — Capability vs Discoverability Audit

> **I-17 of the Quick Preset Switch Mode programme.** Operator-requested, and scoped by the
> operator's own observation on 2026-08-26: *"These are the types of features our Guided Tour
> doesn't cover."*
>
> Measured against the code at commit `04b3d9b`+, on 2026-08-26.

---

## §0 — Why this audit, and why not a different one

Everything found in this sweep has the **same shape**, and none of it was findable by a gate:

| Found | The app can… | But… |
|---|---|---|
| Defect B | save an edited Layout | the control is on a different tab from the editing |
| Quick Preset delete | delete a Quick Preset | only from inside the Manage QPs modal |
| Two VS Code sessions | place two windows of one app | only if each region carries different launch args |

Three for three. **Five green gates had nothing to say about any of them**, and that is not a
failing of the gates: they compare the app to its own rules. Nothing compares **what the app can
do** against **what it tells you it can do**. That gap is what this audit measures.

Every one of the three was found by a person using the app. That is the strongest available
evidence about where the weakness lies, and it is why the audit is scoped here rather than at the
data paths, the agent verbs, or the release artefacts.

---

## §1 — The capability surface, from the code

**33 Tauri commands** are registered in `lib.rs` — 32 under `backend::`/`license::`, plus
`set_hotkey`, which sits outside those namespaces.

> ⚠ **Finding A-0 (stale count).** `check-tour-safety.mjs`'s own header still reasons about
> **"9 of 32 commands reach the agent, 23 do not, 9+23=32"**. That arithmetic was correct for
> v0.4.0. The surface is now 33, because this programme added `quickpresets_switch`. The gate's
> *behaviour* is unaffected — it matches identifiers, not counts — but a comment that states a
> total which no longer holds is exactly the kind of stale fact that gets trusted later. **Fix the
> comment, and re-derive the reach-set arithmetic while doing it.**

---

## §2 — Coverage: 30 user-facing capabilities against Tour and Help

Each capability was tested against the tour text and the help text independently.

**11 of 30 are absent from the Guided Tour. 7 of those are absent from Help as well — taught
nowhere in the product.**

### Taught NOWHERE (tour and help both silent)

| # | Capability | Why it matters |
|---|---|---|
| G-1 | **Multi-window apps** (one launch, N windows placed by title) | The most powerful thing a Layout can express. Also the feature behind defect A. |
| G-2 | **Delete a Layout** | A destructive action with no explanation anywhere. |
| G-3 | **Delete a Quick Preset** | **The operator hit this exact gap during the sweep** and reported "there is no option" before finding it inside Manage QPs. |
| G-4 | **Launch on system start** | A Settings toggle nothing describes. |
| G-5 | **Telemetry opt-out** | A privacy control. Being undiscoverable is its own problem. |
| G-6 | **Licence / trial** | Commercially load-bearing once licensing goes live. |
| G-7 | **Switch mode** | **This programme's own feature** — see §3. |

### In Help, but never taught by the Tour

| # | Capability | Note |
|---|---|---|
| G-8 | **Per-region launch args** | The feature that unlocks two windows of one app. **Zero** mentions in the tour. |
| G-9 | **Two windows of the same app** | Consequence of G-8. |
| G-10 | **Single-instance apps** (Outlook, Teams) | Explains why some apps behave differently on Apply. |
| G-11 | **Quick Preset hotkeys Ctrl+Alt+1–9** | A shipped, powerful feature; the tour never mentions it. |

### The thinnest chapter is the one that matters most

The `apps` chapter has **3 steps**, fewest of the nine, and ends at:

> *"Select a region, pick an app, then Assign to Selection."*

That is exactly one step short of launch args — the next thing a user needs, and the thing that
unlocks G-8, G-9 and the operator's two-VS-Code-sessions case.

### Anchors registered but never visited

**10 of 48**: `bottom-bar`, `dashboard-button`, `guided-tour-button`, `help-sections`,
`main-tabs`, `qp-layouts-link`, `settings-language`, `settings-list`, `tab-help`, `tab-settings`.
Some are structural and legitimately unvisited. It is headroom, not a defect.

---

## §3 — The audit caught this programme's own work, and it was fixed on the spot

**G-7.** The tour step added in I-11 pointed at the Switch mode control and explained the
behaviour — but **never used the words "Switch mode"**. A user searching or scanning for the
feature by name would not have found it, and there was **no Help entry at all**.

That is the same defect this audit exists to find, committed by the increment that was supposed to
prevent it. Corrected immediately, since it is this programme's own scope:

- Tour step title → **"Switch mode — one preset at a time"** / *"Modo intercambio: un preajuste a la vez"*.
- The Quick Presets **Help** section rewritten from 2 bullets to 4, now naming **Switch mode**, the
  **delete** (G-3), and the **Ctrl+Alt+1–9 hotkeys** (G-11).

That closes G-3, G-7 and G-11 in Help. **G-1, G-2, G-4, G-5, G-6 and the tour half of G-8…G-11
remain open** and are the recommended next programme.

---

## §4 — Ranked recommendation

Ranked by *cost of not knowing*, not by ease.

1. **G-8 / G-9 — launch args, in the `apps` chapter.** Highest value per word. It converts a
   dead end into a capability, and the operator hit it directly.
2. **G-1 — multi-window apps.** The most powerful Layout feature, explained nowhere, and the one
   whose invisibility produced defect A.
3. **G-2 / G-3 — the two deletes.** Destructive actions deserve a sentence each.
4. **G-11 — the hotkeys.** Shipped, powerful, unmentioned.
5. **G-4 / G-5 / G-6 — autostart, telemetry, licence.** Settings-surface; G-5 and G-6 grow in
   importance the moment licensing is live.

**Method note for whoever takes this on:** the cross-reference in §2 is a keyword match over the
tour and help text. It answers *"is this ever mentioned?"* — **not** *"is it explained well?"*.
A capability can pass the check on a passing mention. Treat a `yes` as *"no gap proven"*, never as
*"adequately taught"*.

---

*Audit performed 2026-08-26 against `ui/src`, `src-tauri/src/lib.rs` and both locale files.*

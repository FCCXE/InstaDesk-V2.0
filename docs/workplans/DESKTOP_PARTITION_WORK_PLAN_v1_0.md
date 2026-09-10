# Desktop Partition — work plan v1.0

> **Phase 1.** Front opened by the operator 2026‑09‑10 on the Phase 0 evidence:
> `docs/workplans/DESKTOP_PARTITION_INVESTIGATION_v1_0.md` (measured live 2026‑09‑09).
> **Do not re‑derive that evidence.** Read it before this plan.
>
> Method of record: `docs/SESSION_RESUMPTION.md` §0. Where this plan and the handbook differ, the
> handbook wins.

---

## §0 — How this plan is used

1. **Consult before acting; update in the same turn after.** Status lives here, not in memory.
2. **One place per fact.** A number stated twice will disagree eventually — the handbook's §8 was
   two releases stale when this front opened, and that is exactly how.
3. **Nothing off‑plan.** A mid‑flight finding is RECORDED here and left alone unless it is *shown*
   to make authorised work wrong.
4. **A check is written BEFORE the code it guards and proven to BITE.** A check nobody has seen fail
   is not evidence.
5. **Verify, never assume.** A code read is not a measurement, and is labelled as such.

**Rollback point: `pre-desktop-partition-v1`**, cut and pushed in **BOTH** repos 2026‑09‑10 at app
`19d3b60` / agent `1dae9ed`, before any feature work. Release rollback point: **`v0.5.2`**.

---

## §1 — What is being built

Select a monitor, define zones on it, and place desktop **folders** on one side and **app icons** on
the other — and **keep them there** across Explorer restarts, resolution changes and DPI changes.

**Operator rulings, 2026‑09‑10 — these are settled, not open:**

| # | Ruling |
|---|---|
| R‑1 | **Folder‑shortcuts count as FOLDERS.** `FcXe Drive.lnk`, `FCLX Drive.lnk`, `FCLX Drive Sandbox.lnk` are files on disk but open folders. Overrides the seed's unruled default (seed §9.1). |
| R‑2 | Built on **v0.5.2**, the current standing release. |
| R‑3 | **The re‑apply watcher ships in the FIRST version.** *"Keep it tidy is a must."* |
| R‑4 | **The whole feature is a selectable ON/OFF**, and when OFF it does *genuinely nothing* to the desktop. |

---

## §2 — Governing invariants

| # | Invariant | Why |
|---|---|---|
| **D‑1** | **OFF means OFF.** With the feature off: no watcher thread, no re‑apply, no `SendMessageTimeout(Progman, 0x052C)`, no `SetParent`, nothing written into `explorer.exe`. Default **OFF**, like Switch mode. | R‑4. A feature that reaches into Explorer must be something the user switched on, never a surprise. |
| **D‑2** | **Undo exists before apply does.** `--desktop-restore` is built and proven before `--desktop-apply` is written. | Apply‑before‑undo means the first bad run costs the operator their desktop with no way back. |
| **D‑3** | **Never cache the ListView HWND.** Resolve `Progman → SHELLDLL_DefView → SysListView32` every time, with a `WorkerW` fallback. | Seed §6.3 — valid for one Explorer lifetime; both window shapes exist on this machine. |
| **D‑4** | **All coordinate work stays inside the WinAgent.** | Seed §5.2 — the agent is already PerMonitorV2 (verified `true/pm` + `PerMonitorV2`). A DPI‑unaware probe read this desktop 25 % wrong, plausibly. |
| **D‑5** | **An empty result must say WHICH empty it is** — "the desktop has no icons" and "I could not read the desktop" have opposite remedies. | The empty‑value rule; it has bitten this project three times. |
| **D‑6** | **No fixture may name `Code.exe`** in either Sandbox data dir. **Never `Stop-Process -Name Code`.** | VS Code hosts the session. |
| **D‑7** | **Two‑repo order:** `Program.cs` committed and pushed to the WinAgent repo **before** the app tag. | The robot builds the agent from that repo's HEAD. |

---

## §3 — The instrument problem

The UI has a 64‑test vitest suite; **the WinAgent has no test harness at all.** Increment 0's verbs
are Win32 interop against a live `explorer.exe`, which cannot be unit‑tested meaningfully. So the
acceptance evidence is **controls, run by hand and transcribed into this plan** — the same standard
the seed sets:

- **Positive control:** move one icon by hand, re‑run the scan, confirm the reported position changed
  by the expected delta. Proves the scan reads the *real* desktop.
- **Negative control:** point it at a bogus/closed HWND and confirm it fails **loudly**. Proves an
  empty result is not being manufactured by a silent failure.

**Neither control is optional, and a green run without both is not evidence.** Two detectors in the
08‑27 wiring audit certified a codebase with a known dead control in it; the only reason that was
caught was pointing each at a defect whose answer was already known.

---

## §4 — Increments

### I‑0 — Setup ✅ **DONE 2026‑09‑10**
Phase 0 evidence tracked (`19d3b60`); handbook de‑staled; `pre-desktop-partition-v1` pushed to both
repos.

### I‑1 — `--desktop-scan`, read‑only ☐ *not risky (writes nothing)*
Enumerate the ListView and emit JSON on the existing stdout contract: index, display name, current
position, classification (`folder` | `folder-shortcut` | `app-shortcut` | `file` | `shell-virtual`),
and which monitor the position falls on.

Per **R‑1**, `folder-shortcut` is reported as its own class *and* grouped with folders by the zone
engine — the classification stays finer than the zoning so a later ruling can move it without
re‑scanning.

**Traps that apply:** the new `.cs` file must be added to `<ItemGroup><Compile Include=…/>` or it
silently will not compile in (seed §6.1, verified: `EnableDefaultItems` is false, five files listed).
Verb namespace is `--desktop-*`; `--capture-layout` is taken (verified).

**Done when:** both controls in §3 are run and their output is pasted here. **No icon is moved.**

### I‑2 — `--desktop-restore` ☐ **RISKY** → tag `pre-desktop-restore`
Capture all positions to JSON, scramble by hand, restore, confirm **byte‑identical**. Built before
apply (**D‑2**).

### I‑3 — `--desktop-apply` + the zone engine ☐ **RISKY** → tag `pre-desktop-apply`
Per‑monitor zones, grid‑aware packing (snap‑to‑grid is ON and stays on), folders one side / apps the
other. Dry run reports every intended move before any is made.

### I‑4 — The InstaDesk screen, with the ON/OFF ☐ *not risky*
The toggle is **part of this increment, not a later polish** (**R‑4/D‑1**): it must exist the moment
there is anything to switch on. Default OFF, persisted, mirroring `switchMode`.

### I‑5 — `--desktop-watch`, the resident re‑apply ☐ **RISKY** → tag `pre-desktop-watch`
`WM_DISPLAYCHANGE` / `WM_DPICHANGED` / `TaskbarCreated` → re‑apply. **Runs only while the feature is
ON** (**D‑1**). Ships in v1 per **R‑3**.

### I‑6 — Visual panels ☐ **RISKY** → tag `pre-desktop-panels`
`WorkerW` re‑parenting, panels painted behind native icons. **Last**, because it is the only piece
that mutates Explorer's window tree, and everything above is useful without it.

### I‑7 — OPERATOR CHECKPOINT, installed Sandbox ☐
### I‑8 — Release ☐ **RISKY** — requires explicit operator authorisation

---

## §5 — Open decisions

*(none — R‑1…R‑4 settled the four that were open. New ones are recorded here as they arise.)*

---

## §6 — Amendment log

| Date | Entry |
|---|---|
| 2026‑09‑10 | Front opened. Phase 0 was done by a **non‑InstaDesk session** and arrived as an untracked file; tracked as evidence of record. Its four repo traps were **re‑verified** rather than trusted: `EnableDefaultItems` false with five explicit `Compile Include` entries, `--capture-layout` taken, agent manifest `true/pm` + `PerMonitorV2`, nine gates + vitest. All four hold. |
| 2026‑09‑10 | **The handbook the seed defers to was two releases stale**, and following it literally would have rebuilt a shipped feature (§8 named v0.4.0 live and Quick Preset Switch open, three weeks after v0.5.0 shipped it; §4 claimed four gates, there are nine). Method intact, state rotten. Refreshed, and the staleness recorded in place rather than erased. |
| 2026‑09‑10 | **My own first gate count read EIGHT** — a sloppy `grep -o` pattern, not the file. Reading `package.json` as JSON gave nine. Recorded because it is the fourth time in this project that the instrument, not the artifact, was the wrong part. |
| 2026‑09‑10 | **R‑4 arrived after the seed was written** and is not in it: the feature must be a selectable ON/OFF. Promoted to invariant **D‑1** rather than a UI bullet, because "off" has to reach the watcher and the Explorer mutations, not just hide a screen. |

---

*Consult before acting. Update in the same turn after. Nothing happens off‑plan.*

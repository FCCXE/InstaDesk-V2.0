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
| R‑1 | **Folder‑shortcuts count as FOLDERS.** Overrides the seed’s unruled default (seed §9.1). ⚠ **The three files the seed named as examples were the WRONG ones** — `FcXe Drive.lnk`, `FCLX Drive.lnk` and `FCLX Drive Sandbox.lnk` all resolve to executables and are app‑shortcuts (measured, I‑3a). The ruling is unaffected; on this desktop its only true subject is `Dropbox`. |
| R‑2 | Built on **v0.5.2**, the current standing release. |
| R‑3 | **The re‑apply watcher ships in the FIRST version.** *"Keep it tidy is a must."* |
| R‑4 | **The whole feature is a selectable ON/OFF**, and when OFF it does *genuinely nothing* to the desktop. |
| R‑5 | **Items are ordered ALPHABETICALLY within their zone.** Operator, 2026‑09‑10. Implemented with `StrCmpLogicalW` — Explorer’s own *Sort by > Name*, which is digit‑aware, so "Item 2" precedes "Item 10". |

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

### I‑1 findings — four defects and a corrected ruling

**F-1 — my monitor mapping was wrong, and looked right.** ListView coordinates are relative to the
**virtual desktop's bounding box**, not the screen. With DISPLAY3 at `y = -768`, every icon's `y` is
768 larger than its screen `y`. Comparing them directly mapped **36 of 65** icons to "no monitor" —
and the other 29 were right only by **coincidence**, their `y` falling inside DISPLAY1's range both
before and after translation. The output therefore read as *"some icons are off-screen"* rather than
*"the mapping is broken"*. Fixed by translating through `virtualOrigin`, derived from the same
`EnumerateMonitors()` the geometry is tested against. **Unmapped: 36 → 0.**

**F-2 — a display name is NOT a unique key, and every total still reconciled.** A folder `FcXe Drive`
and a shortcut `FcXe Drive.lnk` both render as *"FcXe Drive"* once Explorer hides known extensions.
The first version stored one path per name and let whichever entry enumerated first win, so **9 of 65
items were misclassified** — `FcXe Drive` ×3, `FCLX Drive`, `FCLX DRIVE`, `RigMatrix`, `RIGMATRIX`,
`desktop.ini` ×2. Meanwhile the count was 65, the classes summed to 65, and unmapped was 0. **Totals
reconciling proves nothing about per-item truth.** Now reported as `ambiguous` — D-5's rule: two
candidates with different answers must never collapse into the reassuring one.

> ⚠ **Carried to I‑3:** the zone engine cannot place an `ambiguous` item. It needs a real identity key
> (the item's PIDL / parsing name via `IShellFolder`), not a display name. Recorded, not built.

**F-3 — the seed is WRONG about the three shortcuts R-1 was made for.** Seed §9.1 calls
`FcXe Drive.lnk`, `FCLX Drive.lnk` and `FCLX Drive Sandbox.lnk` *"files on disk but folders in the
operator's head"*. Measured targets: `FcXeDrive.exe`, `FcXeDrive-Sandbox.exe`,
`wscript.exe` / `FcXeDrive-Launcher.exe`. **They launch executables — they are apps.** `app-shortcut`
is correct for them and R-1 does not apply. **R-1's only subject on this desktop is `Dropbox`.** The
ruling stands as written; its scope is simply almost empty. *Recorded, not resolved — the operator may
still want those three treated as folders for a reason a target path cannot see.*

**F-4 — D-3 demonstrated, not asserted.** The seed measured ListView `0x10240`, explorer pid `15080`
on 09‑09. Today: `0x10242`, pid `13896`. **Explorer restarted in between.** A cached handle would already
be stale, one day later.

**F-5 — the seed's §2 display table mixes coordinate spaces.** It lists DISPLAY1 as `2048x864` while
`--list-monitors` (PerMonitorV2) reads `2560x1080`; its *positions* are physical while its *sizes* are
logical, which cannot both hold in one table. Its virtual-desktop total (`6200x2688`) is right and
reproduces exactly. **Use `--list-monitors` for geometry, not the seed's table.**

### I‑1 — `--desktop-scan`, read-only ✅ **DONE + ACCEPTED 2026‑09‑10**

`DesktopIcons.cs` + `ShellLink.cs`, both added to `<Compile Include>` (trap 1 — verified real).
Verb namespaced `--desktop-scan` (trap 2 — `--capture-layout` verified taken).

**NEGATIVE CONTROL — PASSED.** A bogus handle fails loudly, not silently-empty:

```
$ InstaDesk.WinAgent.exe --desktop-scan hwnd=0xDEADBEEF
{"ok":false,"error":"hwnd 0xDEADBEEF is not a window","readable":false}
exit=1
```

**Read-only scan — 65 items, reconciling exactly with the seed's independent 09‑09 count:**

```
route  Progman/SHELLDLL_DefView/SysListView32   listView 0x10242   explorer pid 13896
count 65 · unmapped 0 · virtualOrigin (0,-768) · classes sum to 65
folder 9 · folder-shortcut 1 · app-shortcut 24 · file 20 · ambiguous 9 · shell-virtual 2
```

**POSITIVE CONTROL — PASSED 2026‑09‑10: 2 moves made, 2 detected.**

Operator moved three icons (2 app, 1 folder). The scan detected **two**, both with deltas that are
**exact whole-cell multiples** of the measured snap grid:

```
snap grid (derived from all 65 positions): 116 x 142
MAria colegio  folder     lv (  31,1196) -> (2235,1054)   delta (+2204,-142) = +19 cells, -1 cell
RigMatrix      ambiguous  lv ( 611,1196) -> (1423, 912)   delta ( +812,-284) =  +7 cells, -2 cells
63 items unchanged · count 65 -> 65 · unmapped 0 · classes sum 65
```

Whole-cell alignment is the evidence that matters: the scan reads **real snapped coordinates**, not
plausible noise. Nothing else moved, and nothing was invented.

**The discrepancy resolved, and NEITHER of my hypotheses was right.** Reported initially as three
moves, the scan found two, and I offered exactly two explanations: a sub-cell drag hidden by
snap-to-grid, or a defect in the scan. The operator then confirmed **only two icons were moved** — a
third possibility I had not listed, because I treated the human count as ground truth and confined the
doubt to my own code.

> ⚠ **Worth keeping.** This programme's standing lesson is *suspect the instrument*. Here the
> instrument was the **report**, not the code. When a measurement and a report disagree, "the
> measurement is wrong" and "the measurement is right" do not exhaust the options — **the report can
> be the wrong side**, and enumerating only the two that live inside your own work is how that gets
> missed. Refusing to accept on the reassuring reading was still correct: it just turned out the
> reassuring reading was *"my code is fine"*, which is exactly the one that needed evidence.

✅ **I‑1 ACCEPTED.** Both controls passed — negative (loud failure on a bogus handle), positive (2 of 2
moves detected, whole-cell deltas). No icon has been moved by InstaDesk. Move one desktop icon by hand, re-run the
scan, confirm the reported position changed by the expected delta. Until then the scan is **not
accepted**: nothing yet proves these coordinates track the real desktop rather than being internally
consistent nonsense. **No icon has been moved by InstaDesk.**

### I‑2 — `--desktop-restore` ✅ **DONE + ACCEPTED 2026‑09‑10** → tag `pre-desktop-restore` *(both repos, first)*

The undo, built before any apply exists (**D-2**). A capture is simply a `--desktop-scan` output file,
so there is one format and one reader rather than two that can drift.

**DRY RUN IS THE DEFAULT.** `--apply` is required to move anything: the dangerous direction needs a
deliberate extra word, and a typo cannot rearrange a desktop.

**It REFUSES rather than guesses.** Restoring by index onto a changed item set would move the *wrong*
icons and look like it worked, so every item's `(index, name)` must match the capture:

```
$ --desktop-restore file=<capture with one item removed>
{"ok":false,"error":"the desktop has 65 items but the capture holds 64 — items were added or
 removed, so restoring by position would move the wrong icons","readable":false}          exit=1

$ --desktop-restore file=<capture with item 5 renamed>
{"ok":false,"error":"item 5 is \"USDJ_Jubilee_RepoSnapshot_20251220_211255\" (index 5) but the
 capture recorded \"NOT THE REAL NAME\" (index 5) — the desktop no longer matches the capture"}  exit=1

$ --desktop-restore file=<not a capture>
{"ok":false,"error":"that file is not a --desktop-scan capture (no items array)"}          exit=1
```

**ROUND TRIP PROVEN — and deliberately not circular.** The scramble could not be produced by the code
under test: had `WriteItemPosition` silently done nothing, the scramble would not have happened,
restore would have reported *"0 moves"*, and that would have read as success. So the verification uses
the **independently accepted I‑1 read path**:

```
write   item 0 "Adecuacion Oficinas Cali y Bogota"  (31,770) -> (611,1196)   [5 cells right, 3 down]
verify  independent scan reports exactly (611,1196); items changed: 1 of 65
restore --apply from the original capture -> moved 1
verify  index+name+x+y identical for ALL 65 items;  out of place: 0
        AND identical to the baseline captured BEFORE any write code existed
```

**Net effect on the operator's desktop: none.** One icon moved and returned; 64 never touched.

**⚠ `LVM_SETITEMPOSITION32`, not `LVM_SETITEMPOSITION`.** The latter packs x and y into `lParam` as
two 16-bit halves, which truncates silently beyond ±32767 and on negatives. This desktop is 6200×2688
and *would* have fitted — a coordinate space that only happens to fit is the kind of assumption that
fails on somebody else's monitor wall.
Capture all positions to JSON, scramble by hand, restore, confirm **byte‑identical**. Built before
apply (**D‑2**).

### I‑3 — `--desktop-apply` + the zone engine ☐ **RISKY** → tag `pre-desktop-apply`
Per‑monitor zones, grid‑aware packing (snap‑to‑grid is ON and stays on), folders one side / apps the
other. Dry run reports every intended move before any is made.

**I‑3a — identity ✔ DONE.** The carried blocker is closed: every item now has an absolute
parsing name, and `ambiguous` is **gone (9 → 0)**.

The route that got there was not the one planned, and the difference was decided by measurement:

* **The lParam/PIDL trick is DEAD on this DefView.** The documented-everywhere technique — each
  ListView item keeps its PIDL in `lParam` — was built, run, and measured: `LVM_GETITEMW` **succeeded**
  for all 65 items and returned `lParam = 0` for **every one**. Not a bug; the items carry no lParam.
  The code was deleted rather than left looking live.
* **What caught it was a tally I only added because of D‑5.** The first run reported
  `byIdentity = {name: 65}` — every PIDL read had failed and the display-name fallback had silently
  absorbed all 65, producing output *byte-identical to the previous version*. Without the counter
  there was nothing to see. The eight bare `return null`s were then given reasons, and the answer came
  back as one word: `lparam-zero` ×65.
* **Identity now comes from the shell's own view** (`IShellWindows(SWC_DESKTOP)` →
  `IShellBrowser` → `IFolderView`), over COM — **no cross-process memory access at all**.
  Two preconditions were verified *before* the code was written: the agent is **not elevated**
  (an elevated process is refused the desktop's view), and the calls run on their **own STA thread**
  because `Main` is not `[STAThread]`.
* **The two readers were proven to agree before either was trusted** — `--desktop-identity-probe`, a
  control, not a feature: 65 = 65, **all 65 positions identical**, identity on 65/65. Index pairing is
  therefore sound, and `DesktopSnapshot` **re-checks it every capture** and withholds identity for the
  whole snapshot if it ever fails, rather than pairing the wrong rows.
* **`IFolderView::GetSpacing` reports 116 × 142** — exactly the grid measured by hand from icon
  coordinates in Phase 0. Two unrelated instruments, one number: the grid is now *known*, not inferred.

All nine formerly-`ambiguous` items resolved correctly, and they show why a display name could never
have worked: **three different items are all called "FcXe Drive"** — `C:\Users\Public\Desktop\FcXe Drive.lnk`,
`C:\Users\FABIAN C\Desktop\FcXe Drive.lnk`, and the real folder `C:\Users\FABIAN C\Desktop\FcXe Drive`.

> ⚠ **Carried into the zone engine:** two `desktop.ini` entries are visible desktop items here (hidden
> files are shown). They are system files and the engine must **leave them where they are**, not file
> them under "file". Recorded, not yet built.

**I‑3b — the zone engine ✔ DONE, DRY RUN ONLY.** `--desktop-plan` computes where every icon should go
and prints it. **There is no write path in `DesktopZonePlan.cs` at all** — not a disabled one, not one
behind a flag — and the command accepts no `--apply`. Moving icons is a separate increment.

*Grid.* Monitor 1 is **21 × 7 cells** of 116 × 142, anchored at `(31, 770)`. The model was not assumed:
**all 65 icons sit on exact lattice points**, and the observed extremes (`x` 31…2351, `y` 770…1622) are
precisely the model’s last column and last row. The planner **re‑runs that check on every plan and
refuses if a single icon is off‑lattice** — proven to bite by shifting the phase one pixel: 65 of 65
rejected, 0 placements.

*Layout.* Folders hard left, apps hard right, documents after the folders with a separating gap;
column‑major fill (down, then across), alphabetical per **R‑5**.

*Result here.* folders 13 · documents 19 · apps 29 · untouched 4 = **65**; all 65 destinations
distinct; no problems. The desktop was re‑scanned afterwards: **0 of 65 changed**.

> ⛔ **A DEFECT THE FIRST PLAN HID BEHIND A CLEAN SUMMARY.** It reported `ok=true` with all 65
> accounted for and every count reconciling — while planning **"MAria colegio" onto the Recycle
> Bin’s cell**. The post‑condition compared *placed* items against each other and **excluded the
> untouched ones**, so the single collision that existed lived exactly in the comparison never made.
> Fixed on both sides: the engine now routes around fixed cells (leaving a deliberate visible gap),
> and the check now covers **every** destination. Bite‑proven by disabling only the avoidance — it
> named `(147,770) claimed by: MAria colegio + Recycle Bin`.

*Two rules the plan itself revealed, both now in the engine:*
* **A bare `.exe` is an application**, not a document — `AnyDesk.exe` was being filed with the
  spreadsheets. Only the true extension counts, so `FcXeDrive-Launcher.exe.bak_20260506-094502`
  correctly stays a document.
* **`shell-virtual` items and `desktop.ini` are never moved**, and the plan states *why* for each.

> ⚠ **UNMEASURED, and flagged as such in the output:** all 65 icons are on monitor 1, so whether other
> monitors use the same `(31, 2)` inset **cannot be measured without first moving an icon there**. The
> planner reports `phaseMeasured: false` for any monitor holding no icons rather than sounding
> confident about a number it has never seen.

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
| 2026‑09‑10 | **I‑1's own defects were found by checking the operator's RULING, not the scan's numbers.** Every total reconciled — 65 items, classes summing to 65, unmapped 0 — while 36 icons were mapped to the wrong monitor and 9 were misclassified. What exposed both was asking *"where did the three shortcuts R-1 was made about actually go?"* and finding the answer implausible. **A self-consistent report is not a correct one.** |
| 2026‑09‑10 | **A POST‑CONDITION THAT EXCLUDED HALF THE BOARD PASSED A COLLISION.** The first zone plan was internally perfect — 65 accounted for, counts reconciling, `ok=true` — and put a folder on the Recycle Bin. The distinct‑cell check ran over *placed* items only, so the untouched items it skipped were precisely where the one collision was. **A check that excludes a category cannot find a defect in that category**, and the summary will look flawless while it does so. Both the engine and the check were fixed, and the check was bite‑proven against the original defect. |
| 2026‑09‑10 | **F‑3 is SETTLED by identity, and the seed was wrong.** `FcXe Drive.lnk` and `FCLX Drive.lnk` resolve to executables → `app-shortcut`; the folders `FcXe Drive`, `FCLX DRIVE`, `RIGMATRIX` are separate real directories that merely share a name. **R‑1's only true subject on this desktop is `Dropbox`.** The operator question about the Drive shortcuts is answered by evidence rather than by ruling. |
| 2026‑09‑10 | **A fallback hid a total failure, and only a counter exposed it.** All 65 PIDL reads returned null; the display-name fallback absorbed every one and the output was byte-identical to the previous run. The lesson is not "the trick failed" — it is that **a fallback which cannot be seen firing is indistinguishable from success**. Any future fallback in this front ships with a count of how often it fired. |
| 2026‑09‑10 | **R‑4 arrived after the seed was written** and is not in it: the feature must be a selectable ON/OFF. Promoted to invariant **D‑1** rather than a UI bullet, because "off" has to reach the watcher and the Explorer mutations, not just hide a screen. |

---

*Consult before acting. Update in the same turn after. Nothing happens off‑plan.*

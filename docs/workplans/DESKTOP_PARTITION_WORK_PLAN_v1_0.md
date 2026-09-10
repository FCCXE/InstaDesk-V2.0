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
| R‑6 | **The feature is implemented and tried thoroughly inside the SANDBOX InstaDesk app BEFORE any release.** Operator, 2026‑09‑10: *"we should first implement this new feature inside our Sandbox Instadesk App, try it thoroughly and only then release a new Instadesk version."* The agent CLI is a build layer beneath the product, **not** the place the feature gets validated. |

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
| **D‑8** | **THE SANDBOX IS WHERE THIS FEATURE IS VALIDATED — it just cannot isolate the *desktop*.** Two separate facts, and conflating them is how a gate gets rationalised away. **(a)** There is exactly one Windows desktop per session, so a sandboxed InstaDesk moving icons moves the operator’s real icons: the desktop’s protection comes from **D‑2 (undo before apply)**, a planner with **no write path**, and a byte‑identical re‑scan after every run. **(b)** The feature itself is nevertheless **built and exercised in the Sandbox app** across all four layers (**WinAgent → Rust → `api.ts` → UI**, §5 of the handbook) and validated there before any release (**R‑6**). Agent‑level console runs prove a *mechanism*; they never stand in for the Sandbox trial. ⚠ **Only the Sandbox agent is ever rebuilt** — the production install stays untouched until release. ⚠ **`sandbox.mjs --dev` runs the BUNDLED agent**, so `node src-tauri/scripts/build-agent.mjs` must run after *any* agent change or the Sandbox silently tests the old one (this already cost a debug cycle on 2026‑07‑29). | Operator ruling **R‑6**, correcting this row’s first wording, which explained (a) and left (b) unsaid — readable as licence to skip the gate. |
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

### I‑3c — `--desktop-apply` in the agent ✔ **DONE** — rollback tag `pre-desktop-writer`
The *mechanism* only. This is the **WinAgent layer** of the four (**D‑8b**); **it is not the trial**
(**R‑6**), and **no live apply has been executed** — the first real move belongs in the Sandbox app.

**It adds no new write code.** The single write goes through `DesktopIcons.Restore`, the same mover that
has already returned this desktop byte‑identical, with the planned positions as its target.

*The order IS the design:* plan → **refuse if the plan carries any problem** → refuse unless every item has
a real identity → write the undo → **PROVE the undo** → refuse if anything shifted since planning → write →
re‑read and verify every icon landed.

> ⭐ **Step 4 is the point.** The undo is proven by *replaying it in dry run before anything moves*:
> restoring to a state nothing has left yet must report **exactly zero moves**. An unreadable or wrong undo
> is therefore found while the desktop is still untouched, instead of after 58 icons have moved.

`ReadCaptureFile` is now shared by `--desktop-restore` and `--desktop-apply`: an apply’s undo is consumed
by restore, so two parsers would let the safety net silently stop fitting the thing it catches.

**Verified on the live desktop — nothing moved:**
* dry run: 65 planned, **58 would move, 0 moved**, undo written and proven;
* `--apply` without `undo=` → refused;
* **bite test A** (grid phase shifted one pixel) → refused at stage `plan`, **and no undo file was even
  created**;
* **bite test B** (undo writer corrupted to record `x+1`) → refused at stage `undo`: *"would move 65 icon(s)
  though nothing has moved yet"* — **run WITH `--apply`**, so a broken safety net aborts the operation
  rather than being ignored;
* desktop across every test: **65 items, 0 changed**;
* the dry run’s undo file replays through `--desktop-restore` cleanly.

### I‑4 — The feature inside the SANDBOX app: Rust → `api.ts` → UI, with the ON/OFF ✔ **BUILT**
The remaining three layers, iterated in `node src-tauri/scripts/sandbox.mjs --dev`. **This is where the
feature actually gets used** — monitor selection, the plan preview, Apply, Undo — and where the operator
tries it (**R‑6**).

The toggle is **part of this increment, not a later polish** (**R‑4/D‑1**): it must exist the moment
there is anything to switch on. Default OFF, persisted, mirroring `switchMode`.

> ⚠ **Run `node src-tauri/scripts/build-agent.mjs` after every agent change before `--dev`**, or the
> Sandbox runs the *bundled* (old) agent and the new commands appear not to exist (**D‑8**).

**Built 2026‑09‑10.** Rust `desktop_plan` / `desktop_apply` / `desktop_undo` /
`desktop_undo_available`; `api.ts` types and methods; a **Settings section**, not a fifth tab — four tabs
already sit in that row and a fifth risks exactly the overflow `check‑layout‑yield` exists for.

*Undo location.* `data_dir()/desktop-undo`, which is **per‑flavour**: the Sandbox’s undo files land where
the Sandbox looks for them, never in the production install’s folder (**D‑8**).

*Refusals are DATA, not errors.* A plan with problems, an unproven undo, a desktop that shifted — all come
back as `ok:false` **with the reasons** and reach the screen intact. Collapsing a refusal into an error
string would discard the only part the operator needs.

> ⭐ **OFF MEANS OFF, implemented literally.** While the switch is off the component **does not call the
> agent at all — not even to read**. A read‑only scan would be harmless, but an "off" that still runs
> things is the kind of almost‑off that makes a feature untrustworthy, and from outside nobody can tell a
> scan from a move. Turning it off also **clears any plan still on screen**, so nothing looks pending under
> an off switch. Default OFF, persisted like `switchMode`, and held in `AppState` rather than the pane so a
> tab change cannot silently reset it.

*Two smaller choices, recorded because they are easy to undo later and hard to rediscover:*
* **Apply is offered only after a plan has been seen AND is clean.** The agent refuses a bad plan anyway;
  the button being absent first means the refusal is not how the operator discovers a problem.
* **An assumed grid inset is stated on screen**, not hidden behind a confident number.

*Gates.* All nine pass; **64 tests pass**; `tsc` + `vite build` clean. i18n parity **707 keys per locale**;
backend errors **19 codes, each translated in both locales** — the five new codes were added in the same
pass as the Rust that emits them, never afterwards.

*Casing.* The agent’s desktop JSON was emitting `Ok`/`Columns`/`Index` (C# names a shorthand property
after the variable) beside camelCase fields. Fixed **at the agent, before the UI was written against it**,
so the inconsistency never became a contract.

### I‑7 — FIRST LIVE RUN, and the defect it exposed ✔ **operator ran it**

Operator drove Preview / Apply / Undo in the Sandbox on 2026‑09‑10 and confirmed the **arrangement is
correct**: *"You separated App Icons from folders, from files. This is the correct way."* The layout, the
zones and the alphabetical order are **accepted**.

> ⛔⛔ **AND IT MOVED FOUR ICONS IT HAD PROMISED NEVER TO TOUCH.** The Recycle Bin, both `desktop.ini`
> files and "Learn about this picture" were pushed into the empty middle columns. **Nothing ever wrote to
> those cells.** The tidy result looked right, the operator was satisfied, and the summary reconciled —
> the only trace was a preview afterwards reading *"15 icons would move"* where a settled desktop must
> read 0. **That single number is what exposed it.**

*Cause.* Positions were written **one at a time**. With align‑to‑grid on, an icon written into a cell its
previous occupant has not vacated yet makes Explorer shove that occupant somewhere free, and the cascade
reaches bystanders. **No per‑icon writer can avoid this**, because the intermediate states are real states
of the desktop, not an implementation detail.

> ⛔⛔⛔ **THE UNDO HAD THE SAME DEFECT, WHICH IS WORSE.** A restore left **23 of 65** icons away from
> their captured positions and drifted three untouched items one row down. **The safety net was built
> from the same flawed primitive as the thing it protects against** — and it had been declared proven,
> because the test that proved it (I‑2) restored a desktop that had never been disturbed, so it moved
> nothing and the cascade never had a chance to appear.

*Fix.* Both apply and undo now go through `DesktopFolderView.PositionItems` →
`IFolderView::SelectAndPositionItems`, which takes **every item and every destination in ONE call**, so
there is no intermediate state to collide with. It is the documented API for this and needs **no
cross‑process memory access at all**. Keyed by **absolute parsing name**, not index: an index is a
position in a list Explorer may reorder between the plan and the move. `--desktop-restore` keeps every
identity check it had (count, index and name per item, via `DesktopIcons.Restore` in dry run) — **only
the write changed**.

*Verified on the live desktop.* Restoring the pre‑move baseline moved **23** icons, `unmatched` empty, and
the result is **byte‑identical to the baseline: 0 of 65 differ**, with all four never‑move items exactly
where they started. The operator’s desktop is back as it was found.

> ⚠ **Owed before I‑5:** the watcher re‑applies automatically, so it would have repeated this cascade on
> every trigger. Fixing the writer was therefore a **precondition** of the watcher, not a tidy‑up after it.

> ⚠ **Also owed:** `desktop_undo` takes the NEWEST capture, so applying twice and then undoing once returns
> to the *previous tidy state*, not to the original. Correct as "undo the last apply", but the UI offers no
> way to step back further. Recorded, not yet built.

### I‑5 — `--desktop-watch`, the resident re‑apply ✔ **BUILT** — rollback tag `pre-desktop-watch`
Reacts to **Explorer restarting** (`TaskbarCreated`), a **resolution change** (`WM_DISPLAYCHANGE`), a
**DPI change**, and a **work‑area change**. Ships in v1 per **R‑3**.

> ⭐ **WHAT IT DELIBERATELY DOES NOT DO: react to the operator dragging an icon.** There is **no polling
> at all**. An icon moved on purpose **stays moved** until the next display event. A watcher that snapped
> every drag back would be fighting its own user — *"keep it tidy"* is about surviving **Windows**, not
> overruling the person.

> ⚠ **The window is a hidden TOP‑LEVEL window, not a message‑only one.** Message‑only windows are
> excluded from **broadcast** messages, and `TaskbarCreated` and `WM_DISPLAYCHANGE` are broadcasts — a
> message‑only watcher would receive **nothing at all** while looking perfectly healthy.

*It shells out to its own `--desktop-apply --apply`* rather than calling the apply code directly. That
command is verified as one unit, so invoking it keeps **a single place where a desktop can be
rearranged**, and process isolation means a fault inside an apply cannot take the watcher down.

*Events are debounced* — an Explorer restart needs time before the desktop list exists again, and a
resolution change arrives as a burst. Undo captures **rotate, newest ten kept**. The process publishes
its **pid and HWND before entering the message loop**, so a parent can tell *running* from *died on
startup* without waiting for an event that may not come for hours.

*App side.* `desktop_watch_start` is **idempotent** (kills any existing watcher first, so a double start
cannot leave two processes re‑applying over each other); `desktop_watch_status` uses `try_wait`, because
a stored handle proves one was *started*, not that it is *alive*. Its stdout goes to a **file, never a
pipe nobody reads** — an unread pipe fills and then **blocks the child**, so the watcher would stop
reacting after some number of events and look perfectly alive doing it. **The app’s exit handler kills
it**: an orphan would outlive InstaDesk and keep rearranging the desktop after it was closed, which is
exactly the "off but still doing things" **D‑1** forbids.

> ⭐ **NEW RULE, and it is a judgement, not a mechanism:** the watcher starts only when **BOTH** the
> feature is ON **and a layout has been applied at least once**. Running it before the operator has ever
> pressed Apply would mean a resolution change silently rearranges a desktop they never asked to have
> rearranged — **switching the feature on would become a destructive act by itself**, which is not what
> "on" should mean. "Keep it tidy" means keep **the arrangement they chose**.

*Verified end to end without moving a single icon.* Pointed at **monitor 2 (no icons)** and poked
directly with `WM_DISPLAYCHANGE` and the real `TaskbarCreated` message id — a targeted `PostMessage`, not
a broadcast, so nothing else on the machine was disturbed. Both arrived; the **debounce coalesced them
into ONE apply**; that apply refused with *"monitor 2 holds no icons"*. Desktop unchanged throughout.

**Operator ran the watcher checks, 2026‑09‑10 — and the headline result was MINE to fix.**

> ⛔ **I HANDED THE OPERATOR A TEST THAT COULD NOT FAIL.** Step 6 was *"close the app, restart Explorer,
> the layout should NOT come back"*. It came back — and that proves nothing, because **Explorer restores
> icon positions across its own restart**. On an Explorer restart the layout survives whether the watcher
> runs or not, so the test cannot separate *correctly off* from *wrongly still running*. The timings
> settled it: Explorer restarted at **1:51:54**, the watcher started at **1:52:15** — 21 seconds later, so
> nothing of ours acted. Corroborated by the log: eight startup entries and, until the deliberate
> trigger, **zero events and zero `undo-watch-*.json` files**.
> ⇒ **A behavioural test is worthless when the environment produces the same behaviour by itself.**
> Prefer a DIRECT measurement of the invariant — "is a watcher process running?" — over inferring it.

**Then a deliberate trigger found two real defects.** A targeted `PostMessage` to the live watcher
(matched to its pid, after a stale HWND from an earlier process wasted a poke) produced a clean
receive → debounce → apply — which then reported `stage:"move", error:"no targets given"`.

> ⛔ **"NOTHING TO MOVE" WAS BEING REPORTED AS A FAILURE, AND THAT IS THE NORMAL CASE.** The watcher
> fires on display changes long after the last Apply, by which time the desktop already matches the
> plan — so the **healthy** path was the one that looked broken, once per event, each writing an undo
> file for a move that never happened. *No targets* and *targets exist but none matched an icon* are
> opposite conditions with opposite remedies; only the second is a fault. Now `alreadyCorrect:true,
> moved:0`, and **no undo file**. **Third time this programme has collapsed two meanings of empty into
> the reassuring one** (see also the identity fallback, and the collision check).

> ⚠ **Eight watcher startups in one session.** `desktop_watch_start` is idempotent — it kills any
> existing watcher first — so calling it on every sync churned processes and, worse, **would discard an
> in‑flight debounce and with it the very re‑apply about to happen**. The UI now asks
> `desktop_watch_status` first.

**Operator ran the resolution test, 2026‑09‑10.** The watcher **fired correctly** on both events
(the change and the change back) — and then **refused, rightly**:

> ⭐⭐ **THE GRID CHECK CAUGHT A DEFECT ITS AUTHOR HAD NOT IMAGINED.**
> *"66 of 66 icons are not on the 116×142 lattice anchored at (31,770) — e.g. Recycle Bin at (33,770)."*
> **`MarginX = 31` was measured at ONE resolution and treated as a constant of Windows.** It is not: at
> another resolution every icon sat at `x = left + 33 + 116k`, and changing back returned it to 31. A plan
> built on the wrong phase would have moved **all 66 icons onto a two‑pixel‑wrong lattice** — plausible
> looking, and wrong. The check was written **before** the code it guards and proven to bite; here it
> earned that discipline outright.

*Fix.* The phase is now **DERIVED per run** from the icons on that monitor, using the **modal** remainder
so one icon dragged off‑grid by a user cannot redefine the grid for the other 65. The constants survive
only as a last resort for a monitor with no icons, and their doc says plainly that they are not fixed.
The check is **sharpened, not removed**: it no longer asks *"do the icons match my assumption"* but
*"do the icons agree with EACH OTHER"*, and a disagreement now means the desktop is genuinely
mid‑re‑flow — a real reason to wait for the next event. Bite‑tested by forcing the derived phase off by
one: **66 of 66 rejected, 0 placements**.

> ⚠ **THE LAYOUT IS NOT STABLE ACROSS A RESOLUTION CHANGE, and the reason is structural.** The operator
> reported *"the Desktop partition survives all"* and visually it does — folders left, apps right. But 59
> icons are a **full cell** out of what the plan now computes, because the resolution change **moved the
> untouched items** (the Recycle Bin is no longer at `(147,770)`), and the layout **flows around them**, so
> everything downstream shifts by one slot. ⇒ **An arrangement that depends on where fixed items sit
> inherits their instability.** Recorded, not yet solved — anchoring zones to cells rather than to a fill
> order would remove it.

**I‑5 ACCEPTED by the operator, 2026‑09‑10:** *"the build did survive … I believe the functionality for our Desk Top Partition is working correctly."*

The watcher fired on `work‑area‑change` and `explorer‑restarted` (15:32) and reported
`alreadyCorrect, moved=0` both times — **and that was correct**: the layout had survived the restart.

> ⛔⛔ **A CORRECTION I OWE THE RECORD.** I read the scattered desktop that followed as *"Explorer repacked
> everything and the watcher missed it"*, and wrote that into this plan and into commit `80c66de` as an
> observed failure. **It was not.** The operator had **manually rearranged the icons**. The evidence — four
> untouched icons in the top‑left, 50 of 59 far out of place — fits a person rearranging a desktop
> exactly as well as it fits Explorer repacking one, and **I asserted the cause instead of asking**. Same
> failure as the positive control earlier in this programme: I listed only causes that lived in my own
> code and never listed *the human moved them*.
> ⇒ **When a desktop changes and a person is using it, the person is a hypothesis.** State the reading as
> a question when the evidence cannot separate the two.

*What stands from that episode.* The **settle loop** (commit `80c66de`) is a **HARDENING, not a repair**.
The risk it addresses is real in principle — an Explorer restart completes asynchronously, so a single
look at a fixed delay is a guess about another process’s timing — but **no such failure was ever
observed**. It is kept on that basis, and its commit message overstates the evidence.

> ⚠ **Still literally true and worth keeping:** `moved` has never been above zero in any logged run. Every
watcher apply so far ended in a legitimate refusal or in `alreadyCorrect`. The re‑apply PATH is proven
(atomic positioning, verified against the baseline in I‑7); the watcher **invoking** it on a genuinely
disturbed desktop has not been observed. Recorded as such.

### I‑6 — Visual panels ☐ **RISKY** → tag `pre-desktop-panels`
`WorkerW` re‑parenting, panels painted behind native icons. **Last**, because it is the only piece
that mutates Explorer's window tree, and everything above is useful without it.

### I‑7b — OPERATOR CHECKPOINT, **packaged** Sandbox install ☐
**The gate R‑6 names.** Operator installs the packaged **InstaDesk Sandbox** (upgrades only the Sandbox app) and exercises the feature as a product: toggle OFF proven to do *nothing*, plan preview, apply, undo, Explorer restart, a resolution/DPI change. Only after this does I‑8 exist.
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
| 2026‑09‑10 | ⛔⛔ **I DIAGNOSED A FAILURE THAT NEVER HAPPENED, AND WROTE IT INTO THE PLAN AND A COMMIT.** A scattered desktop after an Explorer restart was read as *"Explorer repacked it and the watcher missed it"*; the operator had **rearranged the icons by hand**. The evidence fitted both causes equally. ⇒ ***When the artifact is something a person actively uses, THE PERSON IS A HYPOTHESIS*** — and if the evidence cannot separate the causes, ask rather than assert. **Second time in this programme** I offered only explanations located in my own code. The remedy shipped anyway (the settle loop) is sound as a hardening, so it stays — relabelled, with its commit noted as overstating the evidence. |
| 2026‑09‑10 | ⭐⭐ **A CHECK CAUGHT A DEFECT ITS AUTHOR HAD NOT IMAGINED.** The grid check existed to catch a wrong *model*; what it actually caught was a **constant that is not constant** — Windows moves the icon‑grid inset when the resolution changes (31 → 33 → 31). Measuring it once and calling it measured is the same error as assuming it. ⇒ **A value read from one configuration is a SAMPLE, not a constant** — derive it per run where the cost is trivial. And note what made this survivable: the check was written before the code it guards, so the wrong grid produced a refusal instead of 66 plausible‑looking wrong positions. |
| 2026‑09‑10 | ⛔ **A BEHAVIOURAL TEST IS WORTHLESS WHEN THE ENVIRONMENT PRODUCES THE SAME BEHAVIOUR BY ITSELF.** I asked the operator to prove the watcher stops with the app by closing it and restarting Explorer — but Explorer restores icon positions across its own restart, so the layout survives either way. The test had no failing branch. ⇒ **Measure the invariant directly** (is the process running?) rather than inferring it from behaviour the environment also produces. The operator reported the observation accurately; the instrument was mine and it was incapable of disagreeing. |
| 2026‑09‑10 | ⛔⛔ **A SAFETY NET BUILT FROM THE SAME FLAWED PRIMITIVE AS THE THING IT GUARDS.** Apply displaced four untouched icons; the undo, which exists to repair exactly that, displaced them too and left 23 of 65 unrestored. **And it had been declared proven** — by a test that restored an undisturbed desktop, so it moved nothing and the failure mode could not appear. ⇒ **Test the undo against a desktop the apply has actually disturbed**, and ask what PRIMITIVE the safety net shares with the operation: if they share the flaw, the net cannot catch it. The visible trace was one number — a settled desktop reading *"15 icons would move"* instead of 0 — in a result the operator had already accepted as correct. |
| 2026‑09‑10 | **F‑3 is SETTLED by identity, and the seed was wrong.** `FcXe Drive.lnk` and `FCLX Drive.lnk` resolve to executables → `app-shortcut`; the folders `FcXe Drive`, `FCLX DRIVE`, `RIGMATRIX` are separate real directories that merely share a name. **R‑1's only true subject on this desktop is `Dropbox`.** The operator question about the Drive shortcuts is answered by evidence rather than by ruling. |
| 2026‑09‑10 | **A fallback hid a total failure, and only a counter exposed it.** All 65 PIDL reads returned null; the display-name fallback absorbed every one and the output was byte-identical to the previous run. The lesson is not "the trick failed" — it is that **a fallback which cannot be seen firing is indistinguishable from success**. Any future fallback in this front ships with a count of how often it fired. |
| 2026‑09‑10 | **R‑4 arrived after the seed was written** and is not in it: the feature must be a selectable ON/OFF. Promoted to invariant **D‑1** rather than a UI bullet, because "off" has to reach the watcher and the Explorer mutations, not just hide a screen. |

---

*Consult before acting. Update in the same turn after. Nothing happens off‑plan.*

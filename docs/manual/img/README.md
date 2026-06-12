# Manual screenshots — shot list

Capture these on a **final, frozen UI** (around Step 2.4), one PNG each, then
replace the matching `<div class="shot" data-shot="NAME">` placeholder in the
manual sources with `<img class="shot" src="img/NAME.png" alt="...">` and re-run
`node docs/manual/build-manual.mjs`.

Capture both **English** and **Spanish** sets if the screenshots contain UI text
(suffix `-en` / `-es`), or keep one set if language-neutral.

| `data-shot` | What to capture |
|---|---|
| `overview` | Full InstaDesk window — left panel, centre grid, right panel, bottom bar. |
| `quickstart-assign` | Cells selected on the grid, Apps tab open, "Assign to Selection" visible. |
| `grid-args` | The per-cell launch-arguments field in the Apps tab. |
| `url-builder` | URL Builder with a browser chosen + a tab group of URLs. |
| `layouts` | Layouts tab with several layout cards (Apply / Edit / Export / Delete). |
| `settings` | Settings tab — theme, language, default grid, margin. |

Tip: capture at a consistent window size and a light theme for print legibility
(or include a dark-theme variant if desired).

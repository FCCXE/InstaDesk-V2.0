# InstaDesk — User Manual (source)

The downloadable PDF manual is generated from the version-controlled HTML
sources here. English and Spanish, matching the app's locales.

## Files
- `manual.en.html` / `manual.es.html` — the manual source (edit these).
- `build-manual.mjs` — generates the PDFs.
- `img/` — screenshots (see `img/README.md` for the shot list).

## Build the PDFs
```
node docs/manual/build-manual.mjs
```
Self-contained: drives an already-installed **Chrome or Edge** in headless mode
(`--print-to-pdf`). No npm deps, no LaTeX/Pandoc. Override the browser with the
`CHROME_PATH` env var if needed.

Output → `ui/public/manual/InstaDesk-Manual-EN.pdf` and `-ES.pdf`, so the app
serves them (and they get bundled when the desktop app is packaged in Step 2.4).
The clickable table of contents carries through as the PDF's interactive index.

## Screenshots (deferred to UI freeze)
The sources currently use dashed **placeholder boxes** (`<div class="shot"
data-shot="...">`). When the UI is final (around Step 2.4), capture the shots
listed in `img/README.md`, drop the PNGs into `img/`, replace each placeholder
with `<img class="shot" src="img/<name>.png" alt="...">`, and re-run the build.

## Status
Text + pipeline + in-app Help reference: **done**. Screenshots + desktop
bundling: **scheduled with Step 2.4** (UI freeze).

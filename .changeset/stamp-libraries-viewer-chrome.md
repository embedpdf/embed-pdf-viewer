---
'@embedpdf/viewer-chrome': minor
---

The Insert tab's Stamp action now opens the stamps sidebar instead of a click-then-pick file dialog; the Image action handles arbitrary PNG and JPEG insertion. The sidebar is now the classic picker over real libraries. Its built-in library comes from `@embedpdf/default-stamps` — the standard rubber stamps as one Acrobat-compatible PDF per locale — loaded on the panel's first open (never at boot), in the locale negotiated from the viewer's language and the browser's, and swapped when the viewer's locale changes; the canvas-drawn placeholder set is gone. The panel gets a library dropdown ("All stamps" plus one entry per library, shown once there are two), a two-column thumbnail grid with the label as tooltip, a hover `×` that removes a stamp from a user library, and per-library export as PDF and remove. Custom libraries persist in IndexedDB across reloads.

"Make stamp" joins the annotation selection strip: with one or more annotations selected on a page, it turns their appearances into a vector stamp in a "My stamps" library and opens the panel on it. Widgets and pending redaction marks are excluded.

New `stamps` option on the viewer customization: `stamps: { defaultLibrary: false }` ships no built-in library and makes no request (air-gapped); `stamps: { defaultLibrary: 'https://your.cdn/{locale}/stamps.pdf' }` self-hosts a copy of `@embedpdf/default-stamps`. The default is the copy that ships with the viewer, loaded as a lazy chunk of your own build; nothing is ever fetched from a third party. English and Spanish strings updated.

---
'@embedpdf/default-stamps': major
---

The default stamp libraries are now self-describing, Acrobat-compatible PDFs. Each `<locale>/stamps.pdf` carries its name as `/Title`, registers every page in `/Names /Pages` as `identifier=label` (`Approved=Goedgekeurd`), and records the library id (`embedpdf-standard`), the locale, and each stamp's kind in `/PieceInfo`. Import one with `importLibraryPdf` from `@embedpdf/plugin-stamp` and the title, identifiers, and labels come from the file; drop the same file into Acrobat's Stamps folder and it appears there. The artwork is unchanged from the previous release (every page renders pixel-identical). Locales: en, de, nl, fr, es, zh-CN, sv, ja. A new `@embedpdf/default-stamps/library` entry delivers each locale through the module graph: `loadDefaultLibrary(locale)` resolves to the library's bytes from a generated, lazily imported module, so the library ships as a chunk of your own build with nothing to copy and no CDN. `LOCALES` lists the shipped codes.

The legacy `<locale>/manifest.json` files remain available for existing v2 viewers that load this package from an unversioned CDN URL. They preserve v2's library and stamp ids, categories, labels, and page indexes, and point to the same adjacent `stamps.pdf` files. V3 reads the PDF metadata directly and does not load these manifests.

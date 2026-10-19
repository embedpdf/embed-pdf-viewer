---
'@embedpdf/engine-core': minor
---

Page pictures can be made for paper. `usage: 'print'` with `viewport: { kind: 'dpi', dpi: 150 | 300 }` draws the page by the print rules: layers in their print state, and only the annotations and form fields with the `print` flag (no-view ones included, hidden ones never). The DPI counts on the paper the page prints on, A4 or Letter: a bigger page gets no more pixels than it needs shrunk to fit. A print picture is the whole page, upright, on white, so it takes no `target`, `rotation` or `background`, and a `dpi` viewport is for print pictures only. It needs `doc.print`, and 300 DPI `doc.print.high`.

- **Options:** `PageRenderOptions` gains `usage`, and `PageRenderViewport` the `dpi` kind; `PageScreenViewport` is the screen sizes alone, which appearance renders take. `checkRenderUsage()` checks a render's usage, and the caller's rights when it knows them; `printDpiOf()` reads a print picture's DPI. `PrintDpi` and `PagePrintRights` name them.
- **Size:** `renderSize()` and `pageTransform()` size a `dpi` viewport for its paper (`printScale()`, `PRINT_PAPER`).
- **Paths:** each picture family has a print family at each tier, `render/print/…` (`doc.print`) and `render/print-high/…` (`doc.print.high`), with the family's planes and pins. The tier is a right, so it is a path of its own, and the CDN signs it only for a session with that right. `PAGE_PRINT_FAMILIES`, `PAGE_PICTURES`, `pagePictureOf()`, `wirePaths.docPagePrint`, `layerPagePrint` and their `…Current` twins, and `PagePrintQuerySchemas`.
- **Conformance:** `runPrintRenderConformance` and its fixture `PRINT_RULES_PDF`.

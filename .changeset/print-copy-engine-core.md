---
'@embedpdf/engine-core': minor
---

`pages.extract(pages, options)` makes a copy of the pages as they draw: `{ flatten: { usage: 'print' } }` is a print copy, with the annotations and form fields that print painted into the pages, nothing interactive left and layers in their print state; `flatten: {}` is the copy as shown on screen. `includeAnnotations` and `includeFormFields` choose what is painted, with a page picture's defaults, and are refused without `flatten`. A flattened copy needs `doc.download` or `doc.download.flattened`, and paints only what the caller may read; `resolvePageExtract()` is that check, shared by both engines. The wire schema of `POST …/pages/extract` takes the options, and `runPrintCopyConformance` checks a print copy against the print picture on any engine.

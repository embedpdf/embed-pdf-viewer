---
'@embedpdf/engine-core': minor
---

Add a document's fonts as one list: `DocumentFontsService`, with `list()` (a `FontList` of the standard fonts, the engine's and the document's own, the fallbacks in the order they are tried, and the last-resort program), `resolve(request)` (which font and program a write would draw each run in, its fallbacks, and the characters no font has), `getProgram(displayHash)` (the code points a program covers, its ascent and descent) and `downloadProgram(displayHash)`. A `Font` says whether it `canChoose` and, when not, its `restrictions` (`'subset'`, `'not-embedded'`, `'preview-and-print'`, `'unsupported-format'`, `'no-unicode-map'`, `'not-served'`). A document's font is named by its PostScript name without the subset tag, so `fontFamily` can name it in a free text or a widget like any other font.

Add the `fonts.changed` document event, and `meta.missingCharacters` on a write that drew characters no font has.

Rename `FreeTextFont` to `FontName`, `faceForFreeTextFont` to `faceForFontName`, and `freeTextFontForFace` to `fontNameForFace`. `LocalDocumentHandle.fonts` is a `LocalDocumentFontsService` (the reads above, plus `setEmbeddingPolicy` and `setTypographicFeatures`) in place of `DocumentFontSettings`.

Add the `document.fonts.list`, `document.fonts.resolve` and `document.fonts.program` worker requests.

`DescribeFont` answers a font's face only (family, weight and italic).

A document program with a display program can go to a browser: `FontProgramFacts.displaySha256` names it, and `displayHash` is it, so a form's Type 1 or CFF field font is `canDownload` while it still can't be chosen for new text. The `document.fonts.program` worker request names its program by `displayHash`.

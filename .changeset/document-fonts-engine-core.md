---
'@embedpdf/engine-core': minor
---

Add a document's fonts as one list: `DocumentFontsService`, with `list()` (a `FontList` of the standard fonts, the engine's and the document's own, the fallbacks in the order they are tried, and the last-resort program), `resolve(request)` (which font and program a write would draw each run in, its fallbacks, and the characters no font has), `getProgram(displayHash)` (the code points a program covers, its ascent and descent) and `downloadProgram(displayHash)`. A `Font` says whether it `canChoose` and, when not, its `restrictions` (`'subset'`, `'not-embedded'`, `'preview-and-print'`, `'unsupported-format'`, `'no-unicode-map'`, `'not-served'`). A document's font is named by its PostScript name without the subset tag, so `fontFamily` can name it in a free text or a widget like any other font.

Add the `fonts.changed` document event, and `meta.missingCharacters` on a write that drew characters no font has. A change's items say it for their op, and its `meta` for the whole change.

Rename `FreeTextFont` to `FontName`, `faceForFreeTextFont` to `faceForFontName`, and `freeTextFontForFace` to `fontNameForFace`. `LocalDocumentHandle.fonts` is a `LocalDocumentFontsService` (the reads above, plus `setEmbeddingPolicy` and `setTypographicFeatures`) in place of `DocumentFontSettings`.

Add the `document.fonts.list`, `document.fonts.resolve` and `document.fonts.program` worker requests.

`DescribeFont` answers a font's face only (family, weight and italic).

A document program with a display program can go to a browser: `FontProgramFacts.displaySha256` names it, and `displayHash` is it, so a form's Type 1 or CFF field font is `canDownload` while it still can't be chosen for new text. The `document.fonts.program` worker request names its program by `displayHash`.

Fallback fonts have tiers (`FALLBACK_TIERS`): the app's own (the server's on the cloud) are tried before the ones the engine comes with, whatever their style, and `FontList.fallbacks` lists them in that order. The `fonts.addFallback` worker request takes a `tier`. A document that drew a character no font has holds the last-resort program, which `doc.fonts.list()` doesn't list as one of its fonts: it is the list's `lastResort`.

Add `runMixedScriptConformance` to the conformance suites: mixed-script text in a free text and a text field, read back from the appearance each exports (each run's font, text, `/ActualText`, direction and place), and flattened, each character's box inside the box it was written in and its right-to-left runs reading as written. `drawnTextOf(pdf)` is the reader it uses.

`fonts` is on every `DocumentHandle` (`LocalDocumentHandle` narrows it to `LocalDocumentFontsService`). A write that changes the fonts the document's list shows ends its events with `fonts.changed` (`SessionEventPublisher.noteFontsChanged`), published with the write before it settles. `TEXT_WRITING_CAPABILITIES`, `listedProgram(list, displayHash)` and `downloadableProgram(list, displayHash)` are the rules `downloadProgram` follows on every engine. `runDocumentFontsConformance` checks a document's fonts on an engine.

For the cloud: `DocumentManifest.fontsVersion` and `serverFonts`, `CacheDelta.fontsVersion`, the font routes' paths (`wirePaths.layerFonts`, `docFonts`, `layerFontsResolve`, `layerFontProgram`, `layerFontProgramFile`, `fontProgramFile`), token (`FontsToken`, `encodeFontsToken`, `decodeFontsToken`), resources and schemas (`FontListSchema`, `FontProgramInfoSchema`, `FontResolveRequestSchema`, `FontResolutionSchema`). A picture's token carries `serverFonts` (`RenderVersions`, `AnnotationRenderVersion`, `WidgetRenderVersion`), and a versioned one requires it. The `fonts.list` and `fonts.program` worker requests read the engine's fonts without a document; a write's payload says `fontsChanged` (`WritePayloadFacts`).

# @embedpdf/engine-runtime

## 3.0.0-next.20

### Minor Changes

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – Read a document's fonts: `EPDFFontFaces_Load` lists every font face the document holds (from form, page, form XObject, pattern, soft mask, Type 3 and annotation appearance resources), each with its programs: object number, format, whether it is embedded whole or as a subset, PostScript name, embedding permission, whether it maps Unicode, SHA-256 and line metrics. `EPDFDoc_GetFontProgramData` reads a program's bytes. `EPDFDoc_ResolveFonts` says which font, registered or the document's own, would draw each run of text, with its fallbacks and the characters no font has, without writing. For a document's program, `EPDFFontResolution_GetProgramDisplayHash` gives what a browser loads for it as the run's own font dictionary reads it.

  Write with a document's own fonts: `EPDFAnnot_SetDefaultAppearanceDocumentFont` names a program the document holds whole in an annotation's default appearance, and the appearance draws its text with that program instead of embedding another. `EPDFAnnot_GetDefaultAppearanceFontPostScriptName` reads it back. Characters an appearance draws with no font are collected (`EPDFDoc_CountMissingCharacters`, `EPDFDoc_GetMissingCharacter`, `EPDFDoc_ClearMissingCharacters`).

  Read registered fonts: `EPDFFont_GetProgramData`, `EPDFFont_GetProgramFormat`, `EPDFFont_GetProgramHash`, `EPDFFont_GetCoverage`, `EPDFFont_GetMetrics`, `EPDFFont_GetPostScriptName`, and `EPDFFont_GetFallbackOrder`, the order fallbacks are tried in for a weight and style.

  Fix a default appearance naming a registered preview-and-print font that was not authorized for editing: new text no longer draws with it.

  Build a display program for a document font a browser can't load as it is (Type 1, bare CFF, a TrueType without a Unicode cmap): an OpenType font with the program's outlines, a Unicode cmap holding exactly the characters the engine writes with the font through the PDF's encoding, and the advances it lays them out with (`/Widths`). It is built from the program as one font dictionary reads it, so two dictionaries that read one stream with other encodings or widths have two. `EPDFFontFaces_GetProgramDisplayHash` names what a browser loads for a program (the program itself, or its display program), and by that hash `EPDFDoc_GetFontDisplayProgramData` returns those bytes, the same bytes every time, and `EPDFDoc_GetFontDisplayProgramCoverage` the characters a browser draws with it. A TrueType or OpenType program whose tables don't each start on a four-byte boundary (Acrobat embeds some Mac fonts this way) goes to a browser as the same tables realigned: a browser refuses it as it is, while the engine reads it.

  A field's /DA font that is a simple font over a program that can author text (an embedded TrueType or OpenType program with a Unicode cmap whose licence allows editing) writes new text through that program's own cmap, as a composite one already did and as Acrobat does. Its 8-bit encoding no longer limits what it writes: Hebrew typed into a field whose Adobe Hebrew font has a Mac Roman encoding draws in Adobe Hebrew, not in a fallback.

  Free text is laid out with the Unicode bidirectional algorithm (UAX #9, ICU's): a paragraph resolves its levels from its `dir`, its runs split where the level changes and are shaped in that direction, and each line's runs are ordered by the algorithm, so numbers, punctuation and brackets in mixed right-to-left and left-to-right text read as a browser shows them. Right-to-left text in a standard font is mirrored and ordered too. Spaces ending a line hang past its end, on the left of a right-to-left paragraph; a right-to-left paragraph's first-line indent is on its right; a justified line's ink reaches both edges, the spaces it ends with no longer stretched.

  Fallback fonts are tried in tiers: `EPDFFont_AddFallbackFont(font_id, tier)` takes one, and `EPDFFont_GetFallbackOrder` lists the lowest tier first, then the closest style, then the order added. A character with its marks goes to the first fallback in that order that has all of it, as CSS picks a font. `EPDFFont_SetLastResortFont` names a registered font that draws a character no font has, as its box, embedded in the appearance like any fallback; the character is still reported missing, and its text extracts as typed. A registered font's coverage is kept as ranges, so a font that maps every code point costs a few bytes.

  Form fields and redaction labels are written by the same text engine as free text: each character with its marks in the first font that has it, then the last resort, shaped, in bidi order with the direction of the first strong character, supplementary characters kept, and ActualText where the glyphs don't spell the text. Their geometry is PDFium's form filler's, so Latin text in a standard font lands exactly where it did: words break where they did, the same line heights, fitted sizes, alignment and comb cells. A password field writes only its stars. A layout font no longer carries a ToUnicode map.

  Fix the boxes and origins of `/ActualText` characters inside a form XObject: they were in the form's own space, so text in a form drawn anywhere but the page's origin, such as a flattened form field, was selected and highlighted in the wrong place. They are in page space now, like every other character.

  Fix reading back `/ActualText` that holds marks or spaces between its words: a line cut the span at them and gave its pieces in visual order, so pointed Hebrew and Arabic with harakat came out scrambled, and a right-to-left span of two words had them swapped. Inside a span, a mark takes the direction of the character before it and the characters between two of the same direction take theirs (UAX #9), so the span reads as written.

  A form field's new appearance stream is a form XObject that says so (`/Type /XObject /Subtype /Form`), as readers and the PDF specification expect: it had neither.

  A document's font index walks a layer incrementally: what each place (the AcroForm, each page) reaches is kept, and a transaction's commit or abort forgets only the places that read what it touched, so a list after an edit walks the pages the edit changed. `EPDFDoc_GetFontsFingerprint` returns a SHA-256 of every fact `EPDFFontFaces_Load` lists: read it before and after a write to learn whether the write changed the document's fonts.

- [#941](https://github.com/embedpdf/embed-pdf-viewer/pull/941) by [@bobsingor](https://github.com/bobsingor) – A rich text style can name the exact document program it draws with: `"program"` (the font program stream's object number) in `EPDFAnnot_SetRichTextJSON`'s body or run styles. The body's program becomes the `/DA` font. `/RC` and `/DS` still name the family, as a PDF does. A run that restates the body's face keeps its program, and a run in another face finds that face by its family. `EPDFDoc_ResolveFonts` takes the same per run (`programs`, or `NULL`), so two programs that describe themselves alike are told apart.

### Patch Changes

- [#940](https://github.com/embedpdf/embed-pdf-viewer/pull/940) by [@bobsingor](https://github.com/bobsingor) – Update the packaged runtime to the fork release with numbered page imports (`EPDFDoc_ImportPages` takes the copies' object numbers), page label sections (`EPDFDoc_GetPageLabelSectionCount`, `EPDFDoc_GetPageLabelSectionAt`, `EPDFDoc_SetPageLabelSections`), fallback font tiers, and `FPDF_GetPageLabel` reading a layer's own labels.

## 3.0.0-next.19

## 3.0.0-next.18

### Minor Changes

- [#911](https://github.com/embedpdf/embed-pdf-viewer/pull/911) by [@bobsingor](https://github.com/bobsingor) – New `EPDFDoc_ImportPages` copies pages with the form fields of their widgets, where `FPDF_ImportPagesByIndex` left each copied widget's `/Parent` naming an object of the source and wrote no `/AcroForm`. Each field above the copied widgets is copied once, its `/Kids` limited to what was copied, and the copied top-level fields join the destination's `/AcroForm /Fields` (made when it has none) with the source's `/DR` resources, `/DA` and `/Q`, `/NeedAppearances`, calculation order and `SignaturesExist`. A `/DR` font is shared only when the destination defines one of that name the same way, key for key (widths and descriptor included, no font program); otherwise it is copied under a free name, and the copied `/DA` strings follow, comments and all. A copied pop-up's `/Parent` names the copy of its annotation.

  New `EPDFDoc_GetImportFieldRoots` lists the top-level fields an import of some pages brings, and `EPDFForm_GetFieldPartialName` reads a field's own `/T` by object number.

- [#913](https://github.com/embedpdf/embed-pdf-viewer/pull/913) by [@bobsingor](https://github.com/bobsingor) – New `EPDFCatalog_GetMetadata` reads the document's XMP packet (the catalog's `/Metadata` stream) decoded, and `EPDFCatalog_SetMetadata` replaces it, unfiltered, keeping the stream's object number, or removes it.

  Saving an encrypted document encrypts its metadata stream, unless the file says `/EncryptMetadata false`; it was written in the clear, so readers decrypted the XMP into noise. A metadata stream with a filter is written decoded, where its encoded bytes were written without the filter that decodes them.

## 3.0.0-next.17

## 3.0.0-next.16

### Minor Changes

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – Binds the fork's attachment captures: `EPDFAttachment_ExportRawToOwnedBuffer`, `EPDFAttachment_ImportRaw` and `EPDFAttachment_ExportCanonicalToOwnedBuffer`.

- [#885](https://github.com/embedpdf/embed-pdf-viewer/pull/885) by [@bobsingor](https://github.com/bobsingor) – The runtime's bindings name the outline editing functions (`EPDFOutline_*`), which address items by object number, keep `/Count` right and work inside layer transactions, and the outline capture functions used to undo a delete. The `EPDFBookmark_*` writers are gone.

- [#891](https://github.com/embedpdf/embed-pdf-viewer/pull/891) by [@bobsingor](https://github.com/bobsingor) – The runtime's bindings name `EPDFDoc_ExportDictCanonicalToOwnedBuffer`: a dictionary and what the layer holds under it as bytes a guard compares, without the keys it is told to leave out and with each stream as it reads.

### Patch Changes

- [#883](https://github.com/embedpdf/embed-pdf-viewer/pull/883) by [@bobsingor](https://github.com/bobsingor) – Bindings for the runtime's new functions, among them `EPDFDoc_ExportPagesFlattened`, which copies pages into a new document as they draw for display or print.

## 3.0.0-next.15

### Minor Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – `EPDF_RenderAnnotBitmap` and `EPDF_RenderAnnotBitmapUnrotated` take a `state` argument that draws a chosen state of an appearance whatever `/AS` says (`NULL` or empty: the state `/AS` selects). New `EPDFAnnot_GetAppearanceStateCount`, `EPDFAnnot_GetAppearanceStateName` and `EPDFAnnot_GetAppearanceState` read an appearance's states and the one shown, as raw name bytes. The `EPDF_RENDER_WIDGETS` render flag draws form fields in page renders. Check box and radio button appearances draw the symbol `/MK /CA` names (check, cross, circle, diamond, square, star) in the `/DA` colour.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add captures (`public/epdf_capture.h`): the layer's own versions of what a write is about to lose or replace, as bytes, and their import, which puts them back. `EPDFPage_ExportAnnotsRawToOwnedBuffer` / `EPDFPage_ImportAnnotsRaw` capture annotations with their positions (what a delete removes) and put them back at the same numbers and positions; `EPDFForm_ExportFieldRawToOwnedBuffer` / `EPDFForm_ImportFieldRaw` do the same for a terminal field, its widgets and the parents its delete prunes; `EPDFDoc_ExportDictRawToOwnedBuffer` / `EPDFDoc_ImportDictRaw` capture one dictionary as it reads now, with the objects under chosen keys (such as `/AP`), and put it back exactly, whole when a save dropped it. A capture never holds the uploaded file's originals, and an import never replaces a version the layer holds. Imports run inside a layer transaction; none loads a page.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form fields get `/EMBD_Metadata`, the same way annotations do. `EPDFForm_HasFieldEmbedMetadata` and `EPDFForm_GetFieldEmbedMetadata{String,Number,Boolean,JSON}` read a field's own metadata from a loaded form model. `EPDFForm_SetFieldEmbedMetadata{String,Number,Boolean,JSON}`, `EPDFForm_ClearFieldEmbedMetadataKey` and `EPDFForm_ClearFieldEmbedMetadata` write it on the field's own dictionary, never a parent's. This reaches fields no annotation handle reaches, such as a radio group's. `EPDFDocument_ClearEmbedMetadata` now clears form fields too. The `EPDF_RENDER_WIDGETS` render flag works with or without `FPDF_ANNOT`: alone, a page render draws its form fields and no other annotation.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form actions and push buttons can be written:
  - **Action creators:** `EPDFAction_CreateJavaScript`, `EPDFAction_CreateHide`, `EPDFAction_CreateResetForm` and `EPDFAction_CreateSubmitForm` make indirect action dictionaries, naming fields by name or object number (`EPDF_ACTION_TARGET`). `EPDFAction_SetNext` chains actions.
  - **Event setters:** `EPDFAnnot_SetEventAction` sets a widget's `/A` or `/AA` event; `EPDFForm_SetFieldEventAction` sets a field's keystroke, format, validate or calculate action. On a field merged with its widget each touches only its own plane's keys. A field's events inherited from a parent are copied in before its first own entry, so they keep applying.
  - **Calculation order:** `EPDFForm_SetCalculationOrder` writes `/AcroForm /CO`.
  - **Push buttons:** `EPDFForm_CreateField` creates push buttons, and attaching a widget draws one with its caption. `EPDFAnnot_Set/GetMKText` (`/MK /CA`, `/RC`, `/AC`) and `EPDFAnnot_Set/GetMKTextPosition` (`/TP`) write and read captions. `EPDFAnnot_GenerateFormFieldAP` draws push buttons.
  - **Rotation:** `EPDFAnnot_Set/GetMKRotation` write and read `/MK /R`.

  Splitting a field merged with its widget (`EPDFForm_AttachWidget`) now moves the widget's `/A` and its `/AA` events to the new widget; before, they stayed on the field and the widget lost them. The new widget also takes the merged dictionary's place in the page's `/Annots`; before, it went to the end, the top of the stacking order.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Form values are written as told:
  - New: `EPDFForm_SetFieldValue`, `EPDFForm_SetFieldDefaultValue`, `EPDFForm_SetFieldSelectedIndices`, `EPDFForm_SetFieldWidgetsChecked` and `EPDFForm_RedrawFieldWidgets`. They decide nothing (no cut to `/MaxLen`, no sibling widgets, no option order) and write nothing a field already holds.
  - Removed: `EPDFForm_SetToggle`, `EPDFForm_SetTextValue`, `EPDFForm_SetChoiceValues`, `EPDFForm_ResetField`, `EPDFForm_SetFieldDefaultValues`, `EPDFForm_SetFieldDefaultToggle`, `EPDFForm_RemoveFieldDefaultValue`, `EPDFForm_ImportFDF` and `EPDFForm_ImportXFDF`. `EPDFForm_SetFieldOptions` writes `/Opt` only.
  - New readers: `EPDF_GetPageTabOrderByIndex` (`/Tabs`), `EPDFForm_GetFieldTopIndex` (a list box's `/TI`), `EPDFAnnot_GetDefaultAppearanceFontFace` (the `/DA` font as family, weight and italic).
  - `EPDFAnnot_Get/SetTextAlignment` take widgets; a text field draws its border style; rewriting `/DA` with `FPDF_FONT_UNKNOWN` keeps the font a field's or the form's `/DA` names.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Adds `EPDF_RenderPageBitmapWithMatrix_Start` and `EPDF_RenderPage_Continue`: a page render with a matrix and clip, as `FPDF_RenderPageBitmapWithMatrix` does it, that pauses once a time budget has passed, so the caller can receive other work, or cancel, between slices. `FPDF_RenderPage_Close` ends or cancels it. However finely a render is sliced, its bytes are those of `FPDF_RenderPageBitmapWithMatrix`.

  Stops building appearances for closed popups on every render. A render with annotations gave every markup annotation that has contents a popup, and generated that popup's appearance, with a font and two new objects in the document, although a closed popup is never drawn. On a drawing with 704 such annotations this cost 88 ms per render natively and 172 ms in WASM, and grew the WASM heap by about 7 MB per render until the document was closed. A popup's appearance is now generated only when the popup is drawn. The output is byte-identical: the deep tiles of that drawing render in 9 ms instead of 92 ms natively, and 13 ms instead of 185 ms in WASM.

  Parsed pages take less memory: path objects no longer carry the bounds and matrix that only text and image objects use, and a path's matrix is stored once for every path that has the same one. A CAD drawing of six million strokes now needs 785 MiB of WASM heap instead of 1,169 MiB, and one of 7.6 million 1,520 MiB instead of 2,001 MiB, with byte-identical renders.

  Adds `EPDF_SetDecodedImageBudget` and `EPDF_GetDecodedImageBytes`: a store of decoded images kept across page loads, off by default, so an image rendered again after its page's image cache was emptied is not decoded again. A kept decode renders the same bytes as a new one. It also keeps images above PDFium's 60 MB limit, which PDFium otherwise decodes again from the first row on every render. Closing a document drops its decodes.

  Fixes corrupted pixels when a Flate image with a PNG predictor is read a second time in one render, for example because the page draws it twice. It affects images above PDFium's 60 MB limit for keeping decodes, which are decoded again from the start each time they are read: the decoder now predicts the first row from zeros again, instead of from the last row it had decoded.

  Resamples 1-bit image masks faster with byte-identical output: where every mask bit under a resampled pixel is clear, or every one is set, the pixel comes from the weights' sum instead of bit by bit. On a flood-map page whose hundred images each carry a 2000 × 2000 mask that is mostly clear, a full-page render takes about 400 ms instead of 720 ms natively, and 480 ms instead of 850 ms in WASM.

  Render nested PDF forms with inherited fill opacity applied once, fixing overly faint stamps and other nested form drawings.

  Parses the numbers in PDF files faster, with identical values: a number written as an optional sign and at most 15 digits, with at most one decimal point, is decoded directly instead of through the general parser. Pages of CAD plots, whose content streams are mostly coordinates, parse 5–11% faster natively.

  Resamples opaque RGB images faster with byte-identical output: the horizontal and vertical passes over 3- and 4-byte pixels read weights and pixels directly and add each channel in two halves, which unsigned arithmetic leaves unchanged. A plan drawn as one 35-megapixel JPEG renders about 12% faster natively and 17% faster in WASM.

  Replays repeated paths one call sooner: the rasterizer's output for a path the content stream repeats is now recorded on its first repeat instead of its second, so every run of identical strokes rasterizes once less. A CAD plot of six million strokes renders about 6% faster, with byte-identical output.

  Keeps tiling patterns in place at every zoom. For a pattern whose cell box equals its step, the renderer placed each cell a cell width rounded up to whole pixels after the previous one, counting from the pattern's origin, so the rounding added up over the cells between that origin and the page. With the origin hundreds of cells off the page, as in a star chart's hatching, the stripes landed tens of pixels from where the PDF puts them, and somewhere else at every zoom. Every cell is now placed at its own position, rounded to the pixel, as for any other pattern, so the stripes sit where Acrobat shows them.

  Renders vector-heavy pages faster with byte-identical output: the rasterizer reuses its buffers across paths instead of allocating them for every path, and content streams build each path without temporary copies. On a CAD plot of six million strokes a full-page render takes about half the time and parsing about a third less. The WASM build is now linked with `-O3`, which makes `embedpdf.wasm` about 9% smaller. Adds `EPDFPage_ResetRenderCache`, which empties a loaded page's image cache so its next render decodes images as a newly loaded page does.

  Renders zoomed-in tiles of pages with many objects faster, with byte-identical output. A page or form with at least 1,024 objects keeps the bounds of each run of 128 consecutive objects, computed the first time a render shows at most half of it, and later renders pass over the runs that lie outside their clip instead of testing every object. Moving, adding or removing objects makes the runs out of date, and the next such render computes them again. On a CAD plot of six million strokes, finding what a deep-zoom tile draws drops from about 22 ms to 0.2 ms.

  Renders runs of repeated paths faster with byte-identical output: a small path drawn again with the same points, drawing state and target reuses the coverage the rasterizer computed for it, and each repeat is still composited in order. Consecutive identical paths in a content stream now share one geometry. On a CAD plot of six million strokes a full-page render takes about 30% less time and the parsed page about 14% less memory.

  The WASM runtime's memory can now grow to 4 GB instead of 2 GB, so a worker with several large documents open no longer runs out at 2 GB. Addresses above 2 GB are read correctly: pointers from the runtime, from `mem.alloc` and from `mem.peek(ptr, 'ptr')` are unsigned, and `mem.peek(ptr, 'ptr')` now returns a `Ptr`, as on the native runtime. Browsers that limit memory lower, such as Safari on iOS, behave as before.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A standard font that a document doesn't embed (Helvetica, Times, Courier, and their aliases such as Arial) now draws with PDFium's built-in face on every platform, as it already did in the browser and on Linux hosts without those fonts. Before, the native builds took the system's font of that name where there was one (Arial, Times New Roman and Courier New on macOS), so the same document drew differently there. A CJK code page still asks the system for its font.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Add `EPDFPage_MoveAnnotsRaw`, which reorders a page's annotations without loading the page.

  Create objects at object numbers the caller chooses. `EPDFLayer_RaiseLastObjectNumber` hands out every number up to the one given, and `EPDFLayer_GetLastObjectNumber` reads the layer's last number. Inside a layer transaction, `EPDFPage_CreateAnnotRaw`, `EPDFForm_CreateField` and `EPDFForm_AttachWidget` (for the widget a merged field splits off) now take an object number, or 0 for the next free one, and refuse a number that isn't free.

  Add `EPDFPage_InsertBlankRaw`, which inserts a blank page without loading it, at a chosen object number or the next free one. An index past the end is refused, not clamped.

  Annotations made by `EPDFPage_CreateAnnotRaw` and `EPDFPage_CreateAnnot`, and the widget a merged field splits off, name their page with `/P`.

  Remove the checkpoint API (`EPDFDoc_BeginCheckpoint`, `EPDFDoc_CheckpointPage`, `EPDFDoc_CheckpointObject`, `EPDFDoc_Rollback`, `EPDFDoc_EndCheckpoint`); layer transactions replace it.

  Fix an aborted page insert leaving the document's `/Info` changed.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A redaction label fitted to its region (font size 0) is burned in on apply, and fills the region. `EPDFAnnot_SetDefaultAppearance` and `EPDFAnnot_SetDefaultAppearanceRegisteredFont` now write `/Helv 0 Tf` for size 0 (auto-size) instead of dropping the font from `/DA`, which left the overlay's label without a font, so it drew nothing. A label shown once at size 0 is fitted on one line, up to 144pt; before, it was laid out multi-line, which auto-sizes only up to 12pt. A redaction whose `/DA` names no font draws its label in Helvetica.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Preserve explicit image masks, optional-content layers, rendering intent and
  interpolation when redacting scanned images. Remove page thumbnails, embedded
  preview copies and alternate image versions that could retain redacted content
  in saved documents.

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – A widget no page's `/Annots` holds is placed on the page its `/P` names only when that is a page of the document: a `/P` left naming a deleted page puts the widget on no page (`EPDFForm_GetFieldWidgetPageObjNum` and the signature model answer 0).

## 3.0.0-next.14

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Add native and WASM APIs to read FreeText rich text as JSON, author it from JSON or XHTML, and generate appearances with multiple fonts, run styles, and text decorations.

  Support CFF font resources, document-level embedding and typographic policies, variable-font instancing, and font embedding-permission enforcement. Preserve registered font identities in saved annotation resources and expose identity and editing-authorization APIs.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add native and WASM APIs for signature inspection, revision comparison, byte-range digests, incremental signing, and signature-field appearances.

  Make incremental layer saves omit unchanged objects and detect reverted edits, including after reopening a layer. Add file-backed layer and overlay reads, share immutable stream data, and compare stream contents in chunks to reduce copying and memory use.

  Fix signature appearance placement, make newly authored form widgets printable, and resolve named pages through the current layer view.

### Patch Changes

- [#820](https://github.com/embedpdf/embed-pdf-viewer/pull/820) by [@bobsingor](https://github.com/bobsingor) – Fix native and WASM text redaction when multiple regions intersect the same text
  object. Later regions no longer leave targeted text searchable or copyable in
  saved PDFs or remove neighboring text. Preserve the positions of remaining text,
  including vertical text.

  Remove stale replacement and alternate text associated with redacted content,
  correct redaction inside transformed nested forms, and preserve unredacted uses
  of shared images and forms.

  Fixes [#801](https://github.com/embedpdf/embed-pdf-viewer/issues/801).

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – `EPDFPage_FlattenAnnotations` flattens a chosen set of a page's annotations with a per-entry status (applied, skipped, not-on-page), replacing the single-annotation `EPDFAnnot_Flatten`. `EPDFPage_ExportAnnotationsAsDocument` flattens a set's appearances into a new single-page document sized to their union rect, replacing `EPDFAnnot_ExportAppearanceAsDocument` and `EPDFAnnot_ExportMultipleAppearancesAsDocument`, which mishandled rotated appearances and the rect fit. Whole-page flatten, selective flatten, and export now share one candidate plan and one placement writer (ISO 32000-2 12.5.5 fit, `/Matrix` honored, no content re-parsing); resources shared between exported appearances are cloned once.

  New named-page functions: `EPDFDoc_GetNamedPageCount`, `EPDFDoc_GetNamedPageAt` (key as UTF-16 plus the value's object number and kind: page, template, or dangling), `EPDFDoc_SetNamedPage` (create or replace, pages in the page tree only), `EPDFDoc_RemoveNamedPage`, and `EPDFDoc_RemoveNamedPagesForPage`. `EPDFDoc_DeletePageByObjectNumber` now removes the `/Names /Pages` registrations of the page it deletes. The name-tree index search reports a pair whose value is a missing object (with a null value) instead of hiding it and desynchronizing later indices.

  Annotation `/Name` is text: `EPDFAnnot_SetName` takes any name, writes a name object (escaping applied by the serializer), and never touches `/AP`; `EPDFAnnot_GetName` fills a text buffer. The `FPDF_ANNOT_NAME` enum, its subtype validation, and the sentinel that removed `/Name` together with `/AP` are removed — remove `/Name` with `EPDFAnnot_RemoveKey(annot, "Name")`.

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – SubmitForm payload getters (Phase 4). `EPDFAction_GetNodeSubmitForm` (has-fields + the raw ISO Table-240 flag word; returns true only when the REQUIRED `/F` resolved to a URL — a `<< /FS /URL >>` file specification with `/UF` preferred over `/F` per 7.11.2, or a bare string `/F` accepted as a producer-compat extension), `EPDFAction_GetNodeSubmitFormURL`, and `EPDFAction_GetNodeSubmitFormCharSet` (PDF 2.0 `/CharSet`, extracted not encoded). `/Fields` entries ride the existing shared target storage (`GetNodeTargetCount`/`TargetName`/`TargetObjectNumber` now also answer for submit-form nodes) and the aggregate payload/target budgets. An unresolvable required component withholds the WHOLE payload — the reader degrades the node; never a half payload.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – Add action-payload getters to the fork's detached action model: unified Hide `/T` / ResetForm `/Fields` target accessors (`EPDFAction_GetNodeTargetCount`/`Name`/`ObjectNumber`, with `-1` marking a target list that could not be fully represented — a partial list must never execute), `EPDFAction_GetNodeHideFlag` (`/H`, spec default hide), `EPDFAction_GetNodeResetForm` (`/Fields` presence + `/Flags` exclude bit — absent and empty are different states), `EPDFAction_GetNodeURIIsMap`, and `EPDFDoc_GetOpenActionDest` for the destination-form catalog `/OpenAction`. Payload capture stays inside the build-time snapshot (nothing lazy, nothing stateful), guarded by new cumulative per-model budgets for target entries and payload bytes plus a destination-array element cap.

## 3.0.0-next.10

### Patch Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Expose the native `EPDFAnnot_SetRect` binding and update the packaged runtime
  build manifests used for rect-preserving annotation moves.

## 3.0.0-next.9

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – Add a public `@embedpdf/engine-runtime/build-id` subpath exposing the runtime's build identity (`ENGINE_RUNTIME_VERSION`, `engineRuntimeTarget()`, and `engineRuntimeBuildId()`) as a side-effect-free Node module. Supervisors and diagnostics can identify the version and resolved native target without loading the native addon.

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Expose full-fidelity UTF-16 page-text extraction and character-to-text mapping through the EmbedPDF PDFium runtime. Supplementary-plane characters are preserved, while non-printing character slots are represented explicitly instead of silently shifting selection and search offsets.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Generate rotated caret appearances in the EmbedPDF PDFium runtime.

  The caret appearance generator now consumes the shared rotation metadata pair, draws in the logical unrotated box, and emits the form transform needed for the baked caret to follow its text baseline.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Updates the EmbedPDF PDFium runtime with oriented per-character geometry and orientation-aware text-markup appearance generation for rotated, sheared, and mirrored text, while retaining safe fallbacks for malformed quads.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the low-level EmbedPDF execution runtime backed by the EmbedPDF PDFium fork. It selects and exposes the appropriate WASM or native platform build used by higher-level engine services.

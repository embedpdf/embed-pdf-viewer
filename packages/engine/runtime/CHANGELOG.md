# @embedpdf/engine-runtime

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add native and WASM APIs for signature inspection, revision comparison, byte-range digests, incremental signing, and signature-field appearances.

  Make incremental layer saves omit unchanged objects and detect reverted edits, including after reopening a layer. Add file-backed layer and overlay reads, share immutable stream data, and compare stream contents in chunks to reduce copying and memory use.

  Fix signature appearance placement, make newly authored form widgets printable, and resolve named pages through the current layer view.

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

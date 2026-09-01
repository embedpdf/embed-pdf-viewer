# @embedpdf/engine-services

## 3.0.0-next.11

### Minor Changes

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The action model reader extracts the SubmitForm payload atomically (feature-detecting the Phase-4 runtime getters: an older runtime payload yields the bare recognized-inert node — the pin-lag skew case, unit-pinned; a NEW runtime withholding an unresolvable `/F` degrades the whole node to `unknown` + `payload-dropped`). `/Fields` targets and the URL/CharSet strings charge the existing aggregate budgets.

- [#793](https://github.com/embedpdf/embed-pdf-viewer/pull/793) by [@bobsingor](https://github.com/bobsingor) – The action-model walker now materialises interpreter payloads (destinations, URIs + `/IsMap`, named-action names, Hide targets + `/H`, ResetForm three-state fields + exclude, file specs) with reserve-before-allocate budgeting — payload lengths are charged against the aggregate read budget before any scratch buffer is allocated, and name-tree script names ride the same budget. `readActionModel` and the annotation/form field readers take the owning document pointer; `readDestination` moved to a shared `features/destinations/` home. The link target is now a pure projection of the payload-carrying activate tree (`linkTargetFromActionTree`) — the duplicate native root-read is gone, an `incomplete` tree projects `unsupported`, and a malformed `/A` no longer silently falls back to `/Dest`.

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Read and write annotation subjects and text review states, preserve current
  annotation state during sparse writes, and use `EPDFAnnot_SetRect` for moves
  that must not regenerate appearances. Event delivery now reports gaps that
  require a full client refresh.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement blank-page insertion with PDFium and dispatch the new
  `pages.insertBlank` worker request. The implementation validates page size,
  count, and destination index, creates persistent blank pages, and returns
  their new page object numbers and layout.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – `WorkerHost` accepts an optional injected `WorkerImageEncoder` (third
  constructor argument) and dispatches the new `*.renderEncoded` kinds
  through it on a narrowly-scoped async path. No new dependencies: the
  native encoder stays in the injecting package. Hosts without an encoder
  (browser/local workers) reject those kinds with `NotImplemented`;
  existing two-argument construction is unchanged.

## 3.0.0-next.7

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Bound individual annotation-appearance raster allocations at deep zoom by reducing the effective appearance scale while preserving the original placement rectangle. Oversized page-spanning appearances now degrade softly instead of exhausting the wasm heap with multi-gigabyte bitmap requests.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Build validated full-fidelity page text snapshots from the runtime's text and character-map calls. Search now converts matched string offsets back into character-space ranges before producing hit geometry, so search, selection, and copied text remain aligned when extracted text diverges from PDF character slots.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Replace the parallel `rects[]` and `quads[]` geometry on `SearchMatch` with canonical `segments: PdfTextSegment[]`, validated by `PdfTextSegmentSchema`.

  Search tokens now always encode `format=segments1`, preventing newer clients from consuming stale CDN-cached responses with the old geometry shape; old tokens fail decoding instead.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Persist and render caret rotation through the engine annotation services.
  - Read and write the caret `rotation` and `unrotatedRect` metadata pair during create, patch, and list operations.
  - Treat caret subtype 14 as box-family when rendering annotation appearances, returning a rotation-stripped raster placed by the logical box so consumers do not double-rotate it after reload.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Reads boxes, oriented cells, flags, and text orientation through the new runtime geometry call, preserving the compact upright wire shape while emitting rotated runs for non-upright glyphs. Native page-redaction failures are now reported instead of being mistaken for pages without redaction annotations.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the runtime-independent Engine v3 service implementations. The same document, page, annotation, form, search, and mutation logic runs over both the local WASM runtime and CloudPDF's native worker runtime.

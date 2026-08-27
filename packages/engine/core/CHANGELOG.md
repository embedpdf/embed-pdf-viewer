# @embedpdf/engine-core

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Add the required `pages.insertBlank(spec, destIndex?)` document operation
  and make `pages.insert` and `pages.extract` required across engine
  implementations. Add the blank-page input types, wire protocol, HTTP paths
  and schemas, conformance coverage, and `pages.inserted` event assertions.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – Add the `*.renderEncoded` wire kinds (`pages.renderEncoded`,
  `document.renderPageFileEncoded`, `annotations.renderAppearancesEncoded`)
  plus their `RenderEncode` / `EncodedImageWire` shapes — cloud-server
  surface (types only): the raster is encoded where it is produced and only
  the compressed image crosses the engine boundary.

  Make document access endpoints document-scoped by changing
  `wirePaths.access` to a `wirePaths.access(docId)` builder. Keep
  `wirePaths.accessLegacy` for transitional clients and allow the scoped
  endpoint to omit `docId` from the request body.

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Add an explicit character-to-text map to page text snapshots, with shared helpers for translating boundaries, converting text offsets to character ranges, slicing selected text, and validating the wire representation. Search hits are now defined in character space, and reusable conformance coverage verifies non-printing characters, supplementary-plane text, and exact search-to-selection round trips.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Add the canonical affine-aware text layout engine under `text/layout`: `buildPageTextLayout`, `textGlyphAt`, `expandTextRangeToWord`/`Line`, `textGlyphQuad`, and `textSegmentsForRange`, producing `PdfTextSegment { quad, rect, advance }`.

  Orientation frames are derived from the semantic edges of glyph quads and keyed by baseline direction and ascent handedness. Rotated and mirrored text become upright inside their frame, while shear remains an in-frame variation so mixed roman and italic text stays in one segment. Every run in a cluster uses the same canonical frame, and upright documents retain a byte-identical fast path.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Extend the caret annotation contract with box-family rotation metadata.

  Caret DTOs, drafts, patches, and schemas now carry optional `rotation` and `unrotatedRect` fields with the same tri-state semantics as other box-family annotations. Rotation-stripped appearance documentation now includes carets.

- [#749](https://github.com/embedpdf/embed-pdf-viewer/pull/749) by [@bobsingor](https://github.com/bobsingor) – Adds `share` to the `OpenInput` union and a `SharePasswordRequired` engine error code.
  - `OpenInputShare` (`{ kind: 'share', shareToken, sharePassword?, password? }`) is the third cloud reference form, alongside `id` and `token`: a public share token from the dashboard's embed snippet, resolved by the cloud engine itself. Rejected by `@embedpdf/engine`, like the other cloud kinds.
  - `sharePassword` is the grant's passphrase (checked at exchange); `password` stays the PDF's own encryption password, same slot as every other kind.
  - `EngineErrorCode.SharePasswordRequired` is the prompt-and-retry signal for protected grants — the share sibling of `DocPasswordRequired`.

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Extends page geometry snapshots with an upright/rotated run union, oriented glyph cells, rotation and ascent-flip metadata, uniform quad and bounds helpers, wire schemas, and orientation conformance coverage.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#720](https://github.com/embedpdf/embed-pdf-viewer/pull/720) by [@bobsingor](https://github.com/bobsingor) – Exports `wireTemplates`, the canonical Fastify-style path templates for backend-callable, unversioned document-plane routes. The templates let `@cloudpdf/contract` and server route-conformance checks share one source of truth without exposing the viewer-only immutable URL variants.

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the transport-independent Engine v3 contract. It includes engine and document interfaces, DTOs, wire schemas, error handling, abortable operations, and a conformance harness shared by local and cloud implementations.

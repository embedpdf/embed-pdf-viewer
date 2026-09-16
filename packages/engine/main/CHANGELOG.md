# @embedpdf/engine

## 3.0.0-next.13

### Minor Changes

- [#817](https://github.com/embedpdf/embed-pdf-viewer/pull/817) by [@bobsingor](https://github.com/bobsingor) – Support reading and authoring rich-text FreeText annotations through the local engine. Expose document-level font embedding and typographic settings through `doc.fonts`.

  Return resolved font identities and embedding permissions from registration, and add `engine.fonts.authorizeEditing()` for applications authorized to edit with preview-and-print fonts.

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Add `doc.signatures` for signature inspection, revision analysis, and two-phase signing with externally supplied CMS data. Support signature-field creation and visual appearances, expose the saved document version, and update the same document handle after signing.

  Open documents as immutable bases with editable layers by default, with `sessionKind: 'plain'` available for unsigned documents. Preserve the loaded bytes on unchanged incremental downloads and add Node file-backed layer opens and `downloadToFile()`.

  Enforce declared signature restrictions by default, distinguish them from modification verdicts, and expose `signedDocumentPolicy` for applications that need to permit invalidating edits.

## 3.0.0-next.12

### Minor Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The local engine implements `page(pon).annotations.flatten` (gated like `pages.flatten`, publishes `annotations.flattened`) and `page(pon).annotations.exportAppearance` (gated by `doc.download` like `pages.extract`).

  It also implements `pages.setName` and `pages.removeName`: register, rename, or remove a `/Names /Pages` entry as a page-structure mutation gated by `doc.pages.assemble`, with the fresh layout returned and a `pages.named` event published. `pages.list()` includes `namedPages`.

  The local engine never contacts a CDN. The zero-config default is the `embedpdf.wasm` your bundler emits beside your code (`@embedpdf/engine-runtime-wasm32/wasm-url`, which webpack, Vite, Rspack, Parcel, and Turbopack all resolve), and it is now streamed and compiled by the worker as it downloads — the previous fetch-then-fallback path had given up streaming. When a toolchain cannot carry that asset (Angular's application builder, plain esbuild), boot fails with the fix named instead of silently fetching a possibly mismatched binary from jsDelivr: `DEFAULT_WASM_URL` and the fetch-failure fallback are gone.

  New `@embedpdf/engine/portable`: the same `localEngine()` with the wasm delivered through the module graph — a lazy chunk of your own build, gzipped and inflated in the browser — so it works with every bundler at the same cost over the wire, with no asset to copy. `wasmLoader` joins `wasmUrl`, `assetsUrl`, and `wasmBinary` as an explicit source (bytes produced on demand at boot). Explicit sources never fall back.

  Angular needs neither: the package's export map routes the `es2020` condition Angular's application builder resolves with to the portable build, so the plain `@embedpdf/engine` import is zero-config under Angular too. Other bundlers do not declare that condition and keep the streamed asset.

## 3.0.0-next.11

## 3.0.0-next.10

### Minor Changes

- [#788](https://github.com/embedpdf/embed-pdf-viewer/pull/788) by [@bobsingor](https://github.com/bobsingor) – Implement local per-record collaboration permission checks for annotation
  creation, mutation, and group assignment. Update scope guards and the local
  runtime integration to support the new annotation and security contracts.

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement `pages.insertBlank` in the local document pages service. Blank-page
  requests use the worker protocol, enforce the page-assembly capability, and
  publish the resulting `pages.inserted` document event.

## 3.0.0-next.8

## 3.0.0-next.7

### Patch Changes

- [#775](https://github.com/embedpdf/embed-pdf-viewer/pull/775) by [@bobsingor](https://github.com/bobsingor) – Update the generated default WASM URL to use the current engine runtime release instead of the previous prerelease.

## 3.0.0-next.6

### Patch Changes

- [#768](https://github.com/embedpdf/embed-pdf-viewer/pull/768) by [@bobsingor](https://github.com/bobsingor) – Fix the default inline image-encoder worker path so it creates the bundled blob worker instead of attempting to fetch `/inline` and silently falling back to main-thread encoding. Tile rendering now keeps encoding work off the main thread under the default configuration.

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Return full-fidelity page text snapshots and character-space search ranges from the local engine. Non-printing and supplementary-plane text now round-trip consistently through extraction, search geometry, selection ranges, and text slicing.

## 3.0.0-next.4

### Minor Changes

- [#755](https://github.com/embedpdf/embed-pdf-viewer/pull/755) by [@bobsingor](https://github.com/bobsingor) – Returns orientation-aware page text geometry from the local engine so consumers can select and annotate rotated, sheared, and mirrored text without collapsing glyph cells into axis-aligned boxes.

### Patch Changes

- [#751](https://github.com/embedpdf/embed-pdf-viewer/pull/751) by [@bobsingor](https://github.com/bobsingor) – Export the shared document types (`OpenInput`, `OpenOptions`, `DocumentHandle`, `PageHandle`, `DocumentCapabilities`, `TokenSource`, …) from the package root, mirroring `@cloudpdf/engine`, so code driving the engine directly can name them without importing from the transitive `@embedpdf/engine-core` dependency.

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the rebuilt local Engine v3 implementation. It runs the EmbedPDF Runtime in a Web Worker for browsers or inline for Node.js and exposes the same abortable document interface as the CloudPDF engine.

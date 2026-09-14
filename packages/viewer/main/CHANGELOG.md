# @embedpdf/viewer

## 3.0.0-next.13

### Minor Changes

- [#812](https://github.com/embedpdf/embed-pdf-viewer/pull/812) by [@bobsingor](https://github.com/bobsingor) – Expose `SignatureToken`, signer adapters, personal key stores, and signature customization types through the viewer's core entry point so applications can configure and control signing from the viewer package.

## 3.0.0-next.12

### Patch Changes

- [#803](https://github.com/embedpdf/embed-pdf-viewer/pull/803) by [@bobsingor](https://github.com/bobsingor) – The built-in stamp library ships inside the viewer instead of being fetched from a CDN. The npm entry keeps `@embedpdf/default-stamps/library` external, so its locale modules become lazy chunks of your own build; the CDN snippet carries them as sibling chunks in its folder. `@embedpdf/default-stamps` is now a dependency. Previously a library build could inline the eight PDFs into the JS chunk as base64, a form webpack rejects.

  The viewer registers `stampPlugin()`, exposes `StampToken` through its drive door, and routes the Insert tab's Stamp action to the stamps sidebar. Arbitrary PNG and JPEG insertion remains available through the Insert tab's Image action.

  The CDN snippet (`dist/embedpdf.js`) once again finds `embedpdf.wasm` when loaded from another origin: the wasm is now an asset Vite emits into the dist folder and references by a URL relative to whichever chunk needs it, instead of a path guessed against the entry file — which had resolved to `chunks/embedpdf.wasm` and failed. A cross-origin test (`pnpm test` in the viewer package, Playwright against the built artifact) now guards it: the snippet must render with every sibling fetched from its own folder and no request to any other origin.

## 3.0.0-next.11

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

## 3.0.0-next.3

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the complete EmbedPDF viewer as a custom element and CDN-ready artifact. It exposes `<embedpdf-viewer>` and `EmbedPDF.init()`, bundles the shared viewer chrome, and wires in the local WASM engine by default.

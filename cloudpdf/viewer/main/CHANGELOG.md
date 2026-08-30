# @cloudpdf/viewer

## 3.0.0-next.10

## 3.0.0-next.9

## 3.0.0-next.8

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

## 3.0.0-next.4

### Minor Changes

- [#749](https://github.com/embedpdf/embed-pdf-viewer/pull/749) by [@bobsingor](https://github.com/bobsingor) – Share sources pass through to the engine; the viewer-only share vocabulary is retired.
  - `{ kind: 'share' }` is a standard `OpenInput` kind now, resolved by `engine.open()` itself — `resolveCloudConfig` no longer lowers share entries into token sources, and no longer re-threads `baseUrl`/`fetch` into the exchange.
  - BREAKING (prerelease line): on share sources the grant passphrase field is `sharePassword` (was `password`, which now means the PDF's own encryption password — the same slot every other kind uses). The top-level `shareToken`/`sharePassword` shorthands are unchanged.
  - `CloudShareSource` and `CloudInitialDocument` remain as deprecated aliases of `OpenInputShare` and `InitialDocument`.

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Accepts public share tokens, so a viewer can be embedded with a dashboard-generated snippet and no backend.
  - Adds the `shareToken` and `sharePassword` options for opening a single shared document.
  - Adds a cloud `{ kind: 'share' }` document source for `documents`, so a multi-tab viewer can mix share tokens, document tokens, and document ids. Each entry exchanges and renews independently, and revoking one share leaves the others untouched. The source is lowered to an ordinary token source before the engine-agnostic viewer core sees it.
  - Re-exports `exchangeShareToken`, `shareSessionSource`, and `ShareExchangeError` so CDN-only consumers can build custom flows, such as prompting for a passphrase before mounting.

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the complete EmbedPDF viewer preconfigured for CloudPDF. It ships as a single CDN-ready `cloudpdf.js` artifact with no browser-side WASM or workers because document processing happens on the CloudPDF server.

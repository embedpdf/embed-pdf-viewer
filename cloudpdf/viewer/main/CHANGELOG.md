# @cloudpdf/viewer

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

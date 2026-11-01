# @cloudpdf/viewer-vue

## 3.0.0-next.19

### Minor Changes

- [#918](https://github.com/embedpdf/embed-pdf-viewer/pull/918) by [@bobsingor](https://github.com/bobsingor) – A document from a grant is `src: { grant, passphrase, restart }`; `password`
  stays the PDF's own. The exchange helpers are `exchangeGrant`,
  `grantSessionSource` and `GrantExchangeError`.

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The component is `<PDFViewer>`, the same as `@embedpdf/viewer-vue`'s (it was `<CloudPDFViewer>`), with the cloud's config: `src` as `{ token }`, `{ id }` or `{ shareToken }`, and the cloud engine's settings under `engine` (`:engine="{ baseUrl }"` for your own server, CloudPDF SaaS without it; `base-url`, `token` and `fetch` were props). `resolveCloudConfig` is gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Vue wrapper for the full viewer on CloudPDF. `<CloudPDFViewer>` takes the CloudPDF connection (`base-url`, `token`) and a document by `doc-token`, `doc-id` or `share-token`, or several through `documents`, and renders `<PDFViewer>` from `@embedpdf/viewer-vue/core` with the cloud engine, so the local PDFium engine stays out of startup. Every other viewer prop, event and slot works as on `<PDFViewer>`; `src`, `scope` and `identity` are left out, because the document's token carries them.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The document is `src`: `{ token }`, `{ id }` or `{ shareToken }`, and it follows its prop; `documents` takes entries of `{ src, name, password, active }`. The `docToken`, `docId`, `shareToken` and `sharePassword` props are gone. The cloud's `DocumentSrc` and `DocumentEntry` types are exported in place of the open viewer's.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The stamp and signature settings go in `plugins.stamp` and `plugins.signature`, read once when the viewer starts, with the local engine for stamp libraries as `plugins.stamp.assetEngine`'s default.

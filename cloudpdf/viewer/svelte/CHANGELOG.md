# @cloudpdf/viewer-svelte

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The component is `<PDFViewer>`, the same as `@embedpdf/viewer-svelte`'s (it was `<CloudPDFViewer>`), with the cloud's config: `src` as `{ token }`, `{ id }` or `{ shareToken }`, and the cloud engine's settings under `engine` (`engine={{ baseUrl }}` for your own server, CloudPDF SaaS without it; `baseUrl`, `token` and `fetch` were props). `resolveCloudConfig` is gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Svelte wrapper for the CloudPDF-powered full viewer. `<CloudPDFViewer>` takes the CloudPDF connection and a document's token, id or share token, supplies the cloud engine itself, and passes every other viewer option, your components and `bind:element` through to `@embedpdf/viewer-svelte/core`'s `<PDFViewer>`; `src`, `scope` and `identity` aren't there, because the document's token carries them. The package re-exports the open viewer's vocabulary and the cloud's `ViewerConfig`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The document is `src`: `{ token }`, `{ id }` or `{ shareToken }`, and it follows its prop; `documents` takes entries of `{ src, name, password, active }`. The `docToken`, `docId`, `shareToken` and `sharePassword` props are gone. The cloud's `DocumentSrc` and `DocumentEntry` types are exported in place of the open viewer's.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The stamp and signature settings go in `plugins.stamp` and `plugins.signature`, read once when the viewer starts, with the local engine for stamp libraries as `plugins.stamp.assetEngine`'s default.

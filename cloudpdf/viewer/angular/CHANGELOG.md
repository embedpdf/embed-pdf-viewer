# @cloudpdf/viewer-angular

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The component is `EpdfPdfViewer`, `<epdf-pdf-viewer>`, the same as `@embedpdf/viewer-angular`'s (it was `CloudPdfViewer`, `<cloudpdf-viewer>`), with the cloud's config: `[src]` as `{ token }`, `{ id }` or `{ shareToken }`, and the cloud engine's settings in `[engine]` (`{ baseUrl }` for your own server, CloudPDF SaaS without it; the required `baseUrl` input and the `token` and `fetch` inputs are gone). `resolveCloudConfig` is gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Introduces the Angular wrapper for the full viewer wired to CloudPDF: `<cloudpdf-viewer>` (`CloudPdfViewer`), the open-source `<epdf-pdf-viewer>` of `@embedpdf/viewer-angular/core` with its engine made from the cloud options. Give it `baseUrl` and the document with `docToken`, `docId` or `shareToken` (with `sharePassword`), or several with `documents`; every other input, output and template of the open viewer works the same, without `src`, `scope` and `identity`, which the document's token carries. The local engine loads only when stamps or signatures need it. It re-exports `@embedpdf/viewer-angular/core`, with the cloud's `ViewerConfig` and `resolveCloudConfig`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The document is the `src` input: `{ token }`, `{ id }` or `{ shareToken }`, and it follows its input; `documents` takes entries of `{ src, name, password, active }`. The `docToken`, `docId`, `shareToken` and `sharePassword` inputs are gone. The cloud's `DocumentSrc` and `DocumentEntry` types are exported in place of the open viewer's.

### Patch Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The stamp and signature settings go in `plugins.stamp` and `plugins.signature`, read once when the viewer starts, with the local engine for stamp libraries as `plugins.stamp.assetEngine`'s default.

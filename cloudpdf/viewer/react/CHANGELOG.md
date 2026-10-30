# @cloudpdf/viewer-react

## 3.0.0-next.18

## 3.0.0-next.17

## 3.0.0-next.16

## 3.0.0-next.15

### Minor Changes

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The component is `<PDFViewer>`, the same as `@embedpdf/viewer-react`'s (it was `<CloudPDFViewer>`), with the cloud's config: `src` as `{ token }`, `{ id }` or `{ shareToken }`, and the cloud engine's settings under `engine` (`engine={{ baseUrl }}` for your own server, CloudPDF SaaS without it; `baseUrl`, `token` and `fetch` were props). `resolveCloudConfig` is gone.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – `<CloudPDFViewer>` makes its engine, documents and stamps once, when the viewer starts, and hands changes of `theme`, `locale`, `disable` and `readOnly` to the running viewer, so a re-render of your app no longer warns about a changed `engine`. Its props are the cloud's `ViewerConfig` (exported) and the wrapper's own: `scope` and `identity` are left out, since the document's token carries them.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The document is `src`: `{ token }`, `{ id }` or `{ shareToken }`, and it follows its prop; `documents` takes entries of `{ src, name, password, active }`. The `docToken`, `docId`, `shareToken` and `sharePassword` props are gone. The cloud's `DocumentSrc` and `DocumentEntry` types are exported in place of the open viewer's.

### Patch Changes

- [#841](https://github.com/embedpdf/embed-pdf-viewer/pull/841) by [@bobsingor](https://github.com/bobsingor) – Align the React CloudPDF viewer entry point with the updated viewer and plugin
  exports.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – Marked `'use client'`, so `CloudPDFViewer` can be imported from a server component; it renders the empty element on the server. `usePDFViewer()`, `useCommand()` and `plugins` work here as in `@embedpdf/viewer-react`.

- [#869](https://github.com/embedpdf/embed-pdf-viewer/pull/869) by [@bobsingor](https://github.com/bobsingor) – The stamp and signature settings go in `plugins.stamp` and `plugins.signature`, read once when the viewer starts, with the local engine for stamp libraries as `plugins.stamp.assetEngine`'s default.

## 3.0.0-next.14

## 3.0.0-next.13

## 3.0.0-next.12

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

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Accepts public share tokens on `CloudPDFViewer`, inherited from the cloud vocabulary it already shares with the snippet.
  - Adds the `shareToken` and `sharePassword` props for rendering a shared document without a backend.
  - Accepts cloud `{ kind: 'share' }` entries in `documents`, so a multi-tab viewer can mix share tokens, document tokens, and document ids.

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the React wrapper for the CloudPDF-powered full viewer. `<CloudPDFViewer>` accepts CloudPDF document tokens while retaining React-owned slots, context, and styling around the shared viewer component.

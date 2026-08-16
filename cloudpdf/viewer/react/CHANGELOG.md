# @cloudpdf/viewer-react

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

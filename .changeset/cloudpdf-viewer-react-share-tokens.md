---
'@cloudpdf/viewer-react': minor
---

Accepts public share tokens on `CloudPDFViewer`, inherited from the cloud vocabulary it already shares with the snippet.

- Adds the `shareToken` and `sharePassword` props for rendering a shared document without a backend.
- Accepts cloud `{ kind: 'share' }` entries in `documents`, so a multi-tab viewer can mix share tokens, document tokens, and document ids.

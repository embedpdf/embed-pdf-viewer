---
'@cloudpdf/viewer-vue': minor
---

The document is `src`: `{ token }`, `{ id }` or `{ shareToken }`, and it follows its prop; `documents` takes entries of `{ src, name, password, active }`. The `docToken`, `docId`, `shareToken` and `sharePassword` props are gone. The cloud's `DocumentSrc` and `DocumentEntry` types are exported in place of the open viewer's.

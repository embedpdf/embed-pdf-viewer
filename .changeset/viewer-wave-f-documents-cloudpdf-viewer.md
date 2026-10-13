---
'@cloudpdf/viewer': minor
---

The document is `src`, in the ways the engine opens one: `{ token }` with a document token from your backend (a string, or a function that gives a fresh one), `{ id }` with the engine's token, or `{ shareToken, sharePassword }` with a share link. `src` follows its prop: another one opens in its place, and `null` closes it. `documents` takes entries of `{ src, name, password, active }` with the same `src`. The `DocumentSrc` and `DocumentEntry` types are exported. The `docToken`, `docId`, `shareToken` and `sharePassword` keys are gone, and so are the `CloudShareSource` and `CloudInitialDocument` types.

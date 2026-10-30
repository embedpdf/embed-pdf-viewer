---
'@embedpdf/core': minor
---

`createKernel({ fetch })` takes your own `fetch` for `{ kind: 'url' }` documents, to add headers or cookies; it gets the URL and an `init` with the document's cancel signal, and `retry()` calls it again. A `{ kind: 'url' }` source takes an `id` of its own. A download the server refuses with 401 or 403 fails as `permission-denied`, and one that isn't a PDF (a sign-in page, say) as `invalid-input`. New exports: the `HostFetch` type and `isPdf(bytes)`.

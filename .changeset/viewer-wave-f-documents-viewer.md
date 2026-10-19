---
'@embedpdf/viewer': minor
---

`documents` takes entries of `{ src, name, password, active }`: each opens in a tab of its own (two entries of one URL are two documents), named as given or after its file, with its password so nobody is asked for it, and the one marked `active` shows first. The `DocumentEntry` type is exported; `InitialDocument` is no longer part of the viewer's types.

A document that can't be opened says why: a URL the server doesn't have fails as `not-found`, and a file or URL whose bytes aren't a PDF (a sign-in page, an image) fails as `invalid-input`, in `viewer.documents.get(id).error`.

On `@embedpdf/viewer/core`, `src` and each entry's `src` also take an engine's open input as it is (`{ kind: 'token', token }` for the cloud engine), and `src` still follows its prop: another one opens in place of the first, which closes first when both name the same document. The `ElementSrc` type names what the element opens.

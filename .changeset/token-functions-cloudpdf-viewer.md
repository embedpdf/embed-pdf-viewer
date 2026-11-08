---
'@cloudpdf/viewer': minor
---

`src: { id, token }` keeps the document open when `src` changes but its `id` doesn't, and takes the next token from the new `src`. A token function written inline in a component, made again on every render, no longer reopens the document.

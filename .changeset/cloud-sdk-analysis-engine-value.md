---
'@cloudpdf/sdk': minor
---

`doc.versions.analysis()` takes `engine` in place of `policy`. `engine` is the `analysis` value of the layer's head: with it, a settled answer is cached. Without it, or with another value, the answer is the server's own and is not cached. A server ignores `policy`, and no longer refuses a request for it.

`doc.versions.signatures()` takes `engine` as well, the `signatures` value of the layer's head, with the same rule for caching.

---
'@embedpdf/engine-core': patch
---

`identity` is the one word for who the user is, on both engines. `OpenOptions.identity` is who your page knows the user is: the local engine's session identity, as before; on the cloud engine a document token decides, and a share link takes it as the visitor's answers to what the link asks. The share input's `visitor` is gone (pass `identity` in the options instead), and `DocumentShare.resume()` takes `{ sharePassword, identity }`. `doc.security.identity` says who a session acts for.

The runtime entry exports `devWarn`, `isDev` and `resetDevWarnings` for engines: development-only warnings, once per key.

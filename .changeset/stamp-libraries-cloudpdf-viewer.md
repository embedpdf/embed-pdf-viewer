---
'@cloudpdf/viewer': patch
---

The `cloudpdf.js` artifact carries the built-in stamp library as lazy sibling chunks in its own folder instead of inlining eight locale PDFs as base64. Nothing is fetched from a third party; set `stamps.defaultLibrary` to self-host or disable it.

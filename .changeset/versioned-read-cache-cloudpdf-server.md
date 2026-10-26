---
'@cloudpdf/server': patch
---

Versioned reads without a CDN now answer `Cache-Control: private, max-age=31536000, immutable` instead of `public, …`. Only the caller's browser may keep a response that needed a token; a proxy in front of the engine no longer may. Deployments with a CDN keep `public`, because the edge checks the signature before serving its copy.

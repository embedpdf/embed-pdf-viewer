---
'@cloudpdf/server': minor
---

Incremental downloads no longer go through the engine. A layer's PDF saved incrementally, the default, is now its base file followed by the delta its stored artifact holds, streamed from storage with the same permission and password checks as before; a layer nobody wrote downloads as its base file, and a signed file's bytes stay exactly as stored. A rewrite (`mode=rewrite`) is still saved by the engine.

Download links: `POST …/layers/{layerName}/download-link` returns a URL that downloads the layer's current PDF without an Authorization header, for services that only take a plain URL. The URL is the layer's versioned download with a `link` token that opens nothing else: it isn't accepted as a bearer token, it works only for the version it was made for (404 once the layer changes), it expires after `expiresIn`, and a password-protected document is checked when the link is made. Deployments that verify tokens with their own keys can mint the same link on their backend, as a doc token with `layer_name` and a `download` claim.

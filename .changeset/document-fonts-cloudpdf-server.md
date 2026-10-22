---
'@cloudpdf/server': minor
---

Every worker registers Noto Sans Hebrew and Noto Naskh Arabic as fallback fonts, tried after the deployment's own (`CLOUDPDF_FONTS`), so Hebrew and Arabic draw with no setup. A key the deployment uses keeps its font.

The server's fonts (`CLOUDPDF_FONTS`, renamed from `CLOUDPDF_FALLBACK_FONTS`; `buildApp({ fonts })`, `ServerFontDescriptor` and `loadServerFontsFromEnv()`) take `serve`: a served font's file goes to a client that may write text, at one URL for every document (`/v1/font-program-files/{hash}`, `private, immutable`), so the viewer types in it; a font not served is listed with `'not-served'`. Noto Sans Hebrew and Noto Naskh Arabic are served.

A document's fonts on the cloud: `GET …/fonts@{fontsVersion,serverFonts}` (the base's shared URL while a layer draws what the base does), `POST …/fonts/resolve`, a program's facts at `…/font-programs/{hash}` and its bytes at `…/font-program-files/{hash}` (for a token with `doc.annotate.modify`, `doc.forms.fill`, `doc.forms.modify` or `doc.redact` that the document's signatures leave it, `private`, never on the CDN). The manifest's `fontsVersion` (migration 036, on layers and base versions) moves with every write the engine says changed the fonts the list shows, and its `CacheDelta` carries it. The manifest's `serverFonts`, a fingerprint of the server's fonts, is in the font list's URL and every picture's, rendered and stored: a change of the server's fonts draws every page again once, and a replica answers only URLs with its own.

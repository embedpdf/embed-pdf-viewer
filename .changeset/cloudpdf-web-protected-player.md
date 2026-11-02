---
'@cloudpdf/web': minor
---

New package: the browser code of CloudPDF's plugins, as `@embedpdf/web` is EmbedPDF's. `browserProtectedPlayer()` is the protected display plugin's player in a browser: it plays the pages' DRM-protected frames in two videos through Encrypted Media Extensions and Media Source, with FairPlay in Safari and Widevine in Chrome, Edge and Firefox. Pass it as `protectedDisplayPlugin({ player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()) })`.

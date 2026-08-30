---
'@embedpdf/plugin-render': minor
---

Add `canRender()` and reject unauthorized page and tile renders locally with
`PermissionDenied`, avoiding repeated engine requests for sessions without
render access.

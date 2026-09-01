---
'@embedpdf/web': minor
---

`createDefaultActionsUiAdapter` — the actions UI adapter's DEFAULT policy (the origin×phase visibility matrix: hover/lifecycle prints suppressed, boot/lifecycle alerts suppressed, sanitizeExternalUri URI opens, browser fallbacks), hoisted here and written ONCE so every framework binding (react, angular) ships the same behavior instead of forking it. Structural twins keep this package plugin-free per the layering law; `overrides` accepts a getter for late-bound handlers.

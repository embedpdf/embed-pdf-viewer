---
'@embedpdf/viewer-chrome': patch
---

The chrome save/print commands become the Phase-4 verb owners: `document:download` runs WS → serialize → DS as ONE queued operation (the WillSave mutations are IN the downloaded bytes; two rapid saves can never interleave) and `document:print` runs WP → `window.print()` → DP under the reentrancy latch — both degrading to today's behavior when the actions plugin is absent.

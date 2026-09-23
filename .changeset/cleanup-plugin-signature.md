---
'@embedpdf/plugin-signature': patch
---

A parked two-phase signing that the engine no longer knows (its abort answers `unknown`) is dropped from `getPending()` instead of staying parked forever.

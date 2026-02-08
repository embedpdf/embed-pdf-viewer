---
'@embedpdf/plugin-interaction-manager': minor
---

Added topic-based page activity tracking system. New methods `claimPageActivity`, `releasePageActivity`, and `hasPageActivity` on both `InteractionManagerCapability` and `InteractionManagerScope`. New `onPageActivityChange` event and `PageActivityChangeEvent` type. Topics are named strings (e.g. 'annotation-selection', 'selection-menu') that can be active on one page at a time per document, automatically moving when re-claimed on a different page.

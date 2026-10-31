---
'@embedpdf/core': minor
---

Add `SettingLock`, who holds a locked setting and why: `by` (a plugin's id, or `'app'`) and `reasonKey`, the translation key of the sentence its disabled controls show. A plugin that lets others lock its settings answers `getLock(key)` with it, as the Stage does.

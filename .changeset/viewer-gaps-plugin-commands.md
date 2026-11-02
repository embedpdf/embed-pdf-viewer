---
'@embedpdf/plugin-commands': minor
---

A command's `enabled`, `active` or `visible` that throws now counts as `false`, so its button shows disabled, not pressed, or hidden; only a command without one takes the default (enabled, not active, visible). `allowed` keeps its own rule.

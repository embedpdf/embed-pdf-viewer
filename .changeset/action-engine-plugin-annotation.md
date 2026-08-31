---
'@embedpdf/plugin-annotation': minor
---

Registers the action engine's session-visibility sink (`applySessionVisibility` on the host lens) when `@embedpdf/plugin-actions` is present, and carries the full activate action tree + annotation ref on `LinkNavItem` so the nav layer can delegate chains to the dispatcher.

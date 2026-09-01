---
'@embedpdf/plugin-annotation': minor
---

Registers the action engine's session-visibility sink (`applySessionVisibility` on the host lens) when `@embedpdf/plugin-actions` is present, and carries the full activate action tree + annotation ref on `LinkNavItem` so the nav layer can delegate chains to the dispatcher.

The pointer-driven hover diff feeds annotation `/AA` cursorEnter/cursorExit through the shared hover pump while reducer-side clears, widgets, links, and tree-less items stay inert. `LinkNavItem` also carries hover-event presence flags for the link plane.

Publish bundle-safe `/contract` and `/contract/host` entries over the same annotation token, plus the focused `/authoring` helper entry. `/internal` keeps its implementation-helper meaning and no longer serves as the sibling bundle boundary.

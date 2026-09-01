---
'@embedpdf/plugin-annotation': patch
---

The pointer-driven `hoverAt` diff feeds annotation `/AA` cursorEnter/cursorExit through the shared hover pump (anti-cascade stays structural: reducer-side hover clears never fire an exit; widgets and links are skipped — their planes own their pixels; tree-less hover costs zero dispatches). `LinkNavItem` gains `hoverEvents` presence flags for the link plane's pump.

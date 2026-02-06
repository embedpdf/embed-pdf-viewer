---
'@embedpdf/plugin-selection': minor
---

Added `onEmptySpaceClick` event to `SelectionScope` and `SelectionCapability`. Fires when the user clicks directly on the page background (empty space) rather than on a child element. Detection runs before mode-gating so it fires for all modes regardless of whether text or marquee selection is enabled. New `EmptySpaceClickEvent` and `EmptySpaceClickScopeEvent` type exports.

---
'@embedpdf/react': minor
---

`useCommandShortcuts({ target })` binds the shortcuts to one element (a ref) instead of the whole window, so a page with several viewers, or a viewer inside a larger app, only reacts while that element has focus.

The text selection layer and its handles follow the viewer's `accent` setting instead of a fixed color.

A capability stand-in's settings calls refuse with `not-ready` while the plugin is still loading, instead of throwing.

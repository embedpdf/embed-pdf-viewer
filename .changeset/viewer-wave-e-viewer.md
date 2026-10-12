---
'@embedpdf/viewer': minor
---

An `<embedpdf-viewer>` marked `data-epdf-wrapped` waits for its `.config` instead of mounting from its attributes. Every framework wrapper marks the element it renders, so an element the server rendered no longer starts a viewer of its own when the viewer's code loads before hydration: before, it started one from its attributes that the wrapper's config then replaced, and on the engine-agnostic door it had no engine to start with. Without the mark, an element still mounts from its attributes, as in plain HTML.

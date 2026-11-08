---
'@embedpdf/viewer-chrome': minor
---

`plugins.stamp.libraries` gives the viewer your own stamp libraries, each `{ id, url }` or `{ id, data }`: loaded when the viewer starts, never stored in the browser, listed in the stamps panel without a way to remove them, and named in `quick` as `<id>:<name>`. Quick stamps in the Insert toolbar now show at the button's full height, so a wide stamp no longer shrinks to a few pixels.

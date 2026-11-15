---
'@embedpdf/viewer-chrome': minor
---

`plugins.stamp.libraries` gives the viewer your own stamp libraries, each `{ id, url }` or `{ id, data }`: loaded when the viewer starts, never stored in the browser, listed in the stamps panel without a way to remove them, and named in `quick` as `<id>:<name>`. Quick stamps in the Insert toolbar now show at the button's full height, so a wide stamp no longer shrinks to a few pixels. A stamp library of your own as the standard stamps (`plugins.stamp.standard: '/my-stamps.pdf'`) is no longer stored in the browser: it went in under the id its file names, or a fresh one for a file that names none (an Acrobat stamp file), so it was stored and imported again beside the stored copy on every visit. It now goes in under the standard id, like the copy that ships, so `standard:<name>` in `quick` finds its stamps. Copies already stored stay in the stamps panel, where each can be removed. Fixes #1084.

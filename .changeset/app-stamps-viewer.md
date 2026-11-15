---
'@embedpdf/viewer': minor
---

`plugins.stamp.libraries` gives the viewer your own stamp libraries, each `{ id, url }` or `{ id, data }`, such as a check mark and a cross for ticking off a printed form: loaded when the viewer starts, never stored in the browser, and named in `quick` as `<id>:<name>` to show in the Insert toolbar. Quick stamps now show at the button's full height, so a wide stamp no longer shrinks to a few pixels. The `StampLibraryFile` type describes one library. A stamp library of your own as the standard stamps (`plugins.stamp.standard: '/my-stamps.pdf'`) no longer shows up once more in the stamps panel on every visit: it is never stored in the browser now, like the copy that ships, and `standard:<name>` in `quick` finds its stamps. Copies already stored stay in the panel, where each can be removed. Fixes #1084.

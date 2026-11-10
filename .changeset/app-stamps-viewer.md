---
'@embedpdf/viewer': minor
---

`plugins.stamp.libraries` gives the viewer your own stamp libraries, each `{ id, url }` or `{ id, data }`, such as a check mark and a cross for ticking off a printed form: loaded when the viewer starts, never stored in the browser, and named in `quick` as `<id>:<name>` to show in the Insert toolbar. Quick stamps now show at the button's full height, so a wide stamp no longer shrinks to a few pixels. The `StampLibraryFile` type describes one library.

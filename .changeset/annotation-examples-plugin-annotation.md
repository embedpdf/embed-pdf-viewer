---
'@embedpdf/plugin-annotation': minor
---

`create(page, fields)` also takes a read of another annotation and makes the same one again (a copy): its own fields are written, and where it is comes from `page`. A kind the engine doesn't know (`subtype: 'unsupported'`) is refused with `invalid-input`, as is a value only another app can write (a beveled border).

A tool's `meta` is your own data again: the plugin never reads it. The calibrate tool captures its line by its id (and so does a tool that extends it), so `meta: { capture: true }` on your own tool no longer turns its drawing into a calibration.

---
'@embedpdf/viewer': minor
---

`fonts` is a top-level setting: `EmbedPDF.init({ fonts: [{ key, url, label }] })`. The local door's `engine` options no longer take `fonts`, and a door's engine provider returns no fonts (`DoorEngine`). Depends on `@embedpdf/core-fonts`, which the viewer's chrome now imports.

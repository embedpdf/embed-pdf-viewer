---
'@embedpdf/angular': minor
---

New `<epdf-snapshot-layer>` in `/render`: the snapshot tool's box on each page, in the `snapshot.box` colors. New `<epdf-snapshot-menu>`: your UI by the snapshot, once it's taken. `EpdfRender` has `canSnapshot()`, `getSnapshot()`, `clearSnapshot()` and `snapshotChanged$`. `copyImage` comes from `/runtime`, beside `saveFile`.

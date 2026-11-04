---
'@embedpdf/web': minor
---

New `copyImage(image)`: copies a picture to the clipboard as PNG, starting the write at once, so it works in a click before the picture is there (Safari copies only then). New `snapshotBoxPaint` and `SNAPSHOT_BOX_DASH`, the look of the snapshot tool's box, with the `--epdf-snapshot-box-fill` and `--epdf-snapshot-box-stroke` variables. `standardCommandsBrowser` has `copyImage`, and its `saveFile` takes the content type.

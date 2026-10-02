---
'@embedpdf/angular': patch
---

`<epdf-render-layer>` fixes, found in the docs' browser pass:

- The page picture's URL is set on the image the moment it exists, like the other adapters, instead of through a binding. A binding applied it at the next change detection, and a page redrawn before that had already revoked it: the image lost its picture until the next one came (a failed `blob:` load in the console).
- A sharp tile tells the render plugin it's gone as its element is destroyed. It used an output, which Angular drops once the directive is destroyed (NG0953), so the plugin kept counting the tile as painted.

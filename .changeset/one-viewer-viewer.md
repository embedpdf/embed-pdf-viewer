---
'@embedpdf/viewer': minor
---

A door may say how its documents open and what plugin settings its engine needs: `DoorEngine.sourceOf` turns a `src` in its engine's words (the cloud's `{ token }`) into what the engine opens, for `src`, `documents` and `.src =`, and `DoorEngine.plugins` goes under the config's own, plugin by plugin. `ElementSrc` takes a door's own documents (the element reads only URLs, files, bytes and open inputs), and a document no door said how to open fails as `invalid-input` instead of being read as bytes.

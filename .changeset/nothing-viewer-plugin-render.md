---
'@embedpdf/plugin-render': minor
---

The `format` and `quality` settings read `null` while the engine chooses, so `updateSettings({ format: null })` gives the choice back; they used to read `undefined`, which a change could never set. `snapshot.box` is one look: a change replaces it whole, and a color it leaves out follows the accent again.

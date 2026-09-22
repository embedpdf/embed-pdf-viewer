---
'@embedpdf/plugin-annotation': minor
---

Annotations stay in sync through one path for every origin: a records mirror loads the document's annotations and folds each confirmed event, whether this session or another made the change, and a create is matched to its confirmation by the `/NM` the client assigns. Writes no longer re-read after they resolve.

- Host lens: `whenSynced()` replaces the hydration members; `getArmedStamp()` and `renderArmedStampPreview(width)` replace `getStampArmEpoch()`/`getArmedStampPreview()`.
- Flattens, form imports and form repairs now update the annotation list and repaint widgets.
- The `/internal` entry is removed; hosts use `/contract/host`.

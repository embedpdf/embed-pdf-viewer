---
'@embedpdf/plugin-annotation': minor
---

Annotations stay in sync through one path for every origin: a records mirror loads the document's annotations and folds each confirmed event, whether this session or another made the change, and a create is matched to its confirmation by the `/NM` the client assigns. Writes no longer re-read after they resolve.

- Host lens: `whenSynced()` replaces the hydration members; `getArmedStamp()` and `renderArmedStampPreview(width)` replace `getStampArmEpoch()`/`getArmedStampPreview()`.
- Flattens, form imports and form repairs now update the annotation list and repaint widgets.
- The `/internal` entry is removed; hosts use `/contract/host`.
- A change the user makes shows at once and is dropped when its engine write settles, success or failure, so a refused change shows the engine's record again (including another session's edit made meanwhile) instead of staying on screen or restoring an old copy. This fixes a refused delete hiding the annotation, refused flags staying, and a refused restyle erasing a collaborator's change.
- `onWriteFailed` reports a refused change and the annotations it carried. An `Annotation` has `pending: true` while a change to it waits for the engine, and its `raw` is always the engine's confirmed record.
- Each pending change holds exactly what one write carries, so settling one write never drops other outstanding work on the same record: typed text waiting for its write survives a flags change or an update of another field, and changes settle in the order they were made even when the engine answers out of order.
- An edit or a delete of a new annotation made before the engine confirmed it is written once the create is, and the selection follows the annotation to its engine key. A refused create drops the changes queued behind it.
- When a page re-read fails, accepted changes stay on screen and `getStatus()` reports `error` until a load succeeds, instead of showing stale records.
- A page's render items are rebuilt only when something on that page changes.
- Typing never shows an older engine echo over newer text.
- Direct-object annotations without `/NM` (addressed by position) keep one record when the engine names them on an edit, and leave no ghost when deleted.
- Every annotation the plugin creates carries an `/NM`.
- A programmatic update keeps rendering from the engine's appearance and fetches it again when the engine re-bakes it.

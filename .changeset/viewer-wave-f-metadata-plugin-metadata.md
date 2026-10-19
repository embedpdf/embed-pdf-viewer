---
'@embedpdf/plugin-metadata': minor
---

The metadata is read on demand, never as a document opens: `getStatus()` is `'idle'` until something asks, then `'loading'` and `'ready'` (or `'forbidden'` / `'error'`). `ensureLoaded()` reads the standard fields and the custom keys unless they're loaded or loading, and resolves once both are there; `onResynced` fires on that first load. `metadataState` asks for it, so `useMetadataState()` (and each framework's equivalent) loads the metadata of the document it reads.

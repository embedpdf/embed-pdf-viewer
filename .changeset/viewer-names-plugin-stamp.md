---
'@embedpdf/plugin-stamp': minor
---

`getAssetBytes()` replaces `readAssetBytes()`: it's synchronous. `StampLibraryChangedEvent` is tagged `type` (was `reason`) and says `'asset-created'`, `'asset-deleted'` and `'deleted'`, as `onAssetCreated`, `onAssetDeleted` and `onLibraryDeleted` do. `ImportLibraryOptions.assetKind` replaces `kind`, which `CreateLibraryOptions` uses for the library's.

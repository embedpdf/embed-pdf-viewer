---
'@embedpdf/plugin-stamp': minor
---

Dynamic stamp evaluation now uses the JavaScript environment configured by `actionsPlugin({ javascript })`. `StampConfig.scripting` and `StampScriptingOptions` are removed; a form-backed asset is evaluated in an isolated detached realm that shares the target document's identity, clock, sandbox, and budget. With scripting disabled or the actions plugin absent, the template is armed unevaluated. Set `dynamic: false` to keep a template static even when scripting is enabled.

A stamp library is now a PDF in Acrobat's stamp-library format. Its `/Title` is the library name, `/Names /Pages` registers each `identifier=label` stamp, its pages contain the artwork, and `/PieceInfo` stores library metadata. `importLibraryPdf` reads Acrobat-authored libraries directly, while a plain PDF still becomes one stamp per page. Loose libraries are removed: raster assets added with `addAsset` become PDF pages, and `StampAsset.format` and `StampLibrary.storage` no longer exist. `StampLibrary` gains `locale`; `StampAsset` gains `label`; and placements write both `/Name` and `/Subj`.

The capability adds `createLibrary`, `addAssetFromAnnotations`, `updateAsset`, `exportLibrary`, `onLibraryChanged`, and `placeAsset`. `createLibrary` now resolves asynchronously. Vector hover previews render lazily at the displayed device-pixel width and are bucketed and cached so they remain sharp while zooming.

Persistence remains outside the plugin through `StampLibraryStore`. Use `indexedDbByteStore` from `@embedpdf/web` in browsers or `memoryStampStore()` for tests and SSR, then connect it with `restoreStampLibraries` and `persistStampLibraries`. The package also exports helpers for stable stamp keys and `/PieceInfo` metadata. This functionality requires an engine with `pages.setName` and `pages.removeName`.

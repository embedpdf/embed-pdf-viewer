---
'@embedpdf/engine-core': minor
---

Every cached read's token carries its kind's engine value and the shape the client reads (`engine`, `shape`): the encoders take a `TokenPin` and the decoders return one as `pin`. `CACHED_READ_KINDS`, `SHAPES`, `tokenPinOf`, `EngineValues` and `TokenPin` are exported from the wire entry. `DocumentHead` gains `engine`, this server's engine value for each kind. `DocumentManifest` no longer carries `serverFonts`, and render and appearance tokens carry the engine value in its place. The layout and search tokens drop `format` (`LAYOUT_FORMAT` and `SEARCH_RESULT_FORMAT` are gone): their shape is `shape`. `PAGE_TEXT_VERSION` and `LINE_BREAKS_VERSION` version the rules page text and returned text are read by.

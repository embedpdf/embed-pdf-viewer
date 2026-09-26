---
'@embedpdf/plugin-page-edit': minor
---

The page-edit plugin now follows the 3.0 public contract.

- Every verb returns a `Promise` (no `AbortablePromise`) and takes `OperationOptions`; refusals are `PluginError`s.
- `rotateBy(pages, delta)` takes a page list and a `90 | -90 | 180` delta; `move(pages, placement)` takes a `PagePlacement` (`{ after } | { before } | { index } | 'end'`) instead of an index.
- `insertBlank` replaces `addBlank`, `insertFromBytes` replaces `insert` (with an optional page subset); `insertFromDocument`, `duplicate` and `extract` are new.
- The package gains `./contract/host` and `./internal` entries.

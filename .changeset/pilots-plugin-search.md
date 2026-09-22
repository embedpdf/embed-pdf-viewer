---
'@embedpdf/plugin-search': minor
---

Rewritten on the kernel's `create()` controller hook with a newest-wins lane for the session. `search()` and `refresh()` (was `rerun`) are awaitable and resolve `{ status, hitCount }`; new `cancel()` keeps the hits found so far. Reads are `getQuery`, `getStatus`, `listHits(filter?)`, `getHitCount`, `listPagesWithHits`, `getActiveHitIndex`, `getActiveHit`, `getProgress`, `getError`; navigation is `nextHit`, `previousHit`, `goToHit`, `revealActiveHit`. Typed events: `onStarted`, `onProgress`, `onCompleted`, `onCancelled`, `onFailed`, `onActiveHitChanged`, `onCleared`. Per-page hit arrays are reference-stable. `SearchPluginConfig` is now `SearchConfig`; `TextSegment` and `SearchMode` are exported.

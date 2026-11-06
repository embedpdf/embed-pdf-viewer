---
'@embedpdf/plugin-stage': minor
---

`StageViewState.pageIndex` replaces `cursor`. `getPageBox()` replaces `getPageFrame()`, since `PageFrame` is a setting. A reveal's alignment is `align?: RevealAlignment`, its values `ArrivalAlignValue` (were `anchor`, `RevealAnchor` and `RevealAnchorValue`, a copy of it). Settings events carry `changedKeys`.

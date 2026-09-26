---
'@embedpdf/web': minor
---

`StageSurfaceHost` and `StageGestureHost` follow the stage host contract: `setViewportSize`, `getPageAt`, `viewportToPage`, `isMoving`; `StageSurfaceHub` is `{ dispatchPointer, getActiveTool, wouldClaimTouch }`. `ClipboardSelectionSource` subscribes through `onChanged` / `onCommitted`.

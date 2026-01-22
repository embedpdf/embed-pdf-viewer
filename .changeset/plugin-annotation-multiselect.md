---
'@embedpdf/plugin-annotation': minor
---

Added multi-selection support with new Redux actions: `ADD_TO_SELECTION`, `REMOVE_FROM_SELECTION`, and `SET_SELECTION`. The `selectedUids` array now tracks multiple selected annotations, with `selectedUid` computed for backward compatibility. Implemented annotation grouping and ungrouping using IRT/RT properties via `groupAnnotations()` and `ungroupAnnotations()` methods. Added unified drag and resize API (`startDrag`, `updateDrag`, `commitDrag`, `cancelDrag`, `startResize`, `updateResize`, `commitResize`, `cancelResize`) that handles multi-annotation operations including attached link annotations. Added `Link` annotation component and `GroupSelectionBox` component for Preact, Svelte, and Vue frameworks. Updated text markup tools to use `strokeColor` and suppress selection layer rects. Improved commit process with `collectPendingChanges`, `executeCommitBatch`, and commit locking to prevent concurrent modifications.

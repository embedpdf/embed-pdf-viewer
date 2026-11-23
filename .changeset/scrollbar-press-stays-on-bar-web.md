---
'@embedpdf/web': patch
---

Keep a press on a scrollbar's track from the page below it. `createScrollbarPresses` stopped a press on the thumb but let a press on the track reach the Stage, which began a gesture of its own with it while the bar paged or jumped.

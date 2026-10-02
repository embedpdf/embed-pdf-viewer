---
'@embedpdf/plugin-stage': patch
---

The stage's frame loops (navigation and zoom tweens, the fling, the camera-rest countdown) are owned by its instance: the frames still scheduled when the document closes are cancelled, and none are scheduled after. One of them used to write into the closed instance ("a state update after the instance closed") whenever a page was torn down mid-countdown.

After placement, a viewport report with no area (a hidden container, or one taken out of the page before its stage is torn down) keeps the last real viewport and the view, instead of fitting to a 0 × 0 box and firing viewport, zoom and camera events. Shown again at its size, the stage carries on where it was.

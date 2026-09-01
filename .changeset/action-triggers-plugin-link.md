---
'@embedpdf/plugin-link': patch
---

Link `/AA` hover presence flags ride `LinkNavItem` from the standalone source too — links are behavior-inert to the annotation plane while navigable, so only the nav layer's anchors can deliver their cursorEnter/cursorExit.

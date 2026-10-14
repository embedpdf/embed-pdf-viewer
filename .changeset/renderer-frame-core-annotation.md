---
'@embedpdf/core-annotation': minor
---

Every render item carries where it draws: `frame`, the box a painter draws into, its turn and how large the page draws it (below 1 for a NoZoom body zoomed in), and `raster`, the engine's picture inside that frame with its own box and turn. Everything an item draws sits upright inside its frame, so a framework layer paints from these and decides no placement of its own. A plain text box's scene is drawn upright for it; a callout's is unchanged.

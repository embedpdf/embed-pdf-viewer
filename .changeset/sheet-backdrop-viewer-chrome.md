---
'@embedpdf/viewer-chrome': patch
---

Fix sheets on a phone: a menu or panel sheet slides straight up from the bottom of the viewer instead of landing too high and dropping into place, and the whole viewer stays dimmed behind it while it slides in or is dragged. Dragging a sheet's handle down fades the dimming with it, and the dimming returns when the sheet is let go at rest.

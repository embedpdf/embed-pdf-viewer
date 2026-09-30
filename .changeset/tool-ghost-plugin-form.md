---
'@embedpdf/plugin-form': minor
---

Field tools show their ghost: the field a click places, with the tool's defaults, round for a radio button (its tool is now `widget-radio`). Placement goes through the annotation core's `gesturePlacement`, the drag previews through the annotation plugin, and a cancelled gesture places nothing.

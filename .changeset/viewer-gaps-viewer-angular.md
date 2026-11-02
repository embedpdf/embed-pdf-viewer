---
'@embedpdf/viewer-angular': minor
---

`EpdfButton` and `EpdfMenuItem` take `active`: shown pressed, or checked, as a command's button or row is while its command is active, for a toggle of your own (a theme switch). `EpdfIcon` draws one of the viewer's icons, or one of yours (`icons`), in the color of the text around it: `name`, `size` (default 20) and `label` for screen readers. `size`, `touch` and `warnBeforeLeaving` are inputs (read once). Inside the viewer, `inject()` finds every plugin's service, now with `EpdfMetadata`, `EpdfOutline`, `EpdfAttachment` and `EpdfFonts`: the list is keyed by the viewer's plugin names, so the compiler catches one left out.

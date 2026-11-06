---
'@embedpdf/viewer-chrome': patch
---

Toggles tell screen readers when they're off, not only when they're on: a tool's or a panel's button, a quick stamp and the measurement scale say `aria-pressed="false"` while off. The style panel's alignment and bold, italic and underline buttons say whether they're pressed, where they said nothing. A button that opens a dialog, such as Print, no longer says it's pressed while the dialog is open.

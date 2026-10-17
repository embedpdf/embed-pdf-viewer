---
'@embedpdf/web': patch
---

New `isolatePointerDown(element, onPress)`: a press inside a control (a link, a form field) stops there instead of reaching the Stage below, and `onPress` takes it for the control. A framework that dispatches from its root, as React does, sees the press only after the Stage has, so its control takes the press here.

---
'@embedpdf/plugin-stage': patch
---

The main stage lens registers `goto` and `named` action executors with the action engine when present: GoTo destinations reveal through the camera, NextPage/PrevPage/FirstPage/LastPage execute, unknown named verbs report inert.

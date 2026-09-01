---
'@embedpdf/viewer-chrome': patch
---

Scripting migrates to `actionsPlugin({ javascript: { enabled: true } })` with a bare `formPlugin()`; the Shell's form scripting provider hook is gone — `useActionsUiAdapter` carries everything.

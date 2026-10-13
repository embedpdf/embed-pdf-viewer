---
'@embedpdf/plugin-measurement': patch
---

A page's viewports read that the closing document cut short no longer writes its error into the closed plugin's state, which the kernel reported as `a state update after the instance closed`, as when a reader leaves a page within a second of its first page showing.

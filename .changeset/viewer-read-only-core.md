---
'@embedpdf/core': patch
---

A document plugin asked for while it is being created (a listener reading it during a store notification its own `create` caused) is no longer built a second time: the read finds no capability yet. A second instance took the first one's state and mirror cells, so a mirror such as the annotation records never loaded.

---
'@embedpdf/plugin-selection': patch
---

Add the rest of the selection handles' policy, so every framework adapter shares it: `selectionHandleViewOf(stage)` (the handles' view over a Stage), `selectionHandleEndpointsOf(snapshot)` (both ends of the selection, or null) and `armSelectionHandle(selection, view, endpoints, role)` (the point a press grabbed and the drag it starts from the opposite end).

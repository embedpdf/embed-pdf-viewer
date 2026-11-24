---
'@embedpdf/angular': patch
---

`<epdf-scrollbar>` binds its track with `attachScrollbar` from `@embedpdf/web`, the one call every framework's bar makes. A press on the bar with any button now stays on the bar; a press with a button other than the main one used to reach the Stage below it.

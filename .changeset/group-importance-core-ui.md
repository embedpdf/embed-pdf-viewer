---
'@embedpdf/core-ui': patch
---

An item without its own `importance` has its group's, as the docs say, instead of `3`. `group('annotate', items, { importance: 2 })` now moves those items into the "More" menu before the rest of the bar, and every item of a group at `5` stays in the bar. An item's own `importance` still wins, and a custom item without a command is still pinned.

---
'@embedpdf/plugin-page-edit': minor
---

`pageEdit.reorder(pages, placement)` replaces `move()`. A placement is `{ after: page }`, `{ before: page }`, `'start'` or `'end'`; `{ index }` is gone. A placement's page is fixed when the verb is called and handed to the engine as a neighbour.

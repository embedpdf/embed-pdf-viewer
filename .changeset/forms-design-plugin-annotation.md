---
'@embedpdf/plugin-annotation': minor
---

- `lend(lender)` (host): a sibling plugin lends its records, and they are selected, moved, resized, restyled, reordered and deleted with the annotation tools. Each edit of a lent record is its owner's ops in the same change as the rest of the edit, so a drag of form fields and annotations together is one change and one undo step. The form plugin lends its widgets in design mode.
- A stated `update()` or `delete()` of a lent record is refused, naming its owner; `reorder()` reorders lent records through their owner in the same change. Lent records aren't grouped, and `list()` leaves them out.
- A push button tool's defaults take text styling (`widget-button`).

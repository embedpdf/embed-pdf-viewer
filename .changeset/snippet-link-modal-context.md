---
'@embedpdf/snippet': minor
---

Fixed link modal context handling:

- Added `source` prop to LinkModal to distinguish between annotation and text selection context
- Updated `annotation:add-link` command to pass `{ source: 'selection' }` when opening modal
- Updated `annotation:toggle-link` command to pass `{ source: 'annotation' }` when opening modal
- Prevents incorrect behavior where annotation selection would override text selection when creating links

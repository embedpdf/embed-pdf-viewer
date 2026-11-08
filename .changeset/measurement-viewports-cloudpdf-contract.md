---
'@cloudpdf/contract': minor
---

The manifest and a write's cache delta carry `viewportsVersion`, the pin of the pages' scales. The page layout carries each page's `viewports`, and `doc.pages.setScale` answers with the new layout. The changes endpoint takes the `pages.setScale` op. The page list and the measurement viewport are named components.

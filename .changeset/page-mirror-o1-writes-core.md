---
'@embedpdf/core': patch
---

A page mirror's write costs the same however many pages it holds. Each page load copied every
loaded page's entry, so loading every page of a 1,000-page document took about 2,000 writes and
1.5 million copies.

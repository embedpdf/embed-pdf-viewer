---
'@embedpdf/plugin-measurement': patch
---

`getReadout(ref)` hands out the same readout object until the annotation changes, so a framework read compares it by identity. New exports for a read with nothing to read: `NO_PAGE_SCALE`, a page's scale before a document opens or for a page that isn't there, and `NO_READOUT`, which `getReadout` also answers for an annotation that isn't there.

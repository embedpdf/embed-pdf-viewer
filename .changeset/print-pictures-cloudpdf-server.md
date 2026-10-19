---
'@cloudpdf/server': minor
---

Serve the print pictures at both tiers: each picture family printed at 150 DPI under `render/print/` (needs `doc.print`) and at 300 DPI under `render/print-high/` (needs `doc.print.high`), on top of the family's own rights. A print picture's token is its pins and its format; the server sizes it from the DPI and the paper. Print pictures are cached at their versioned URLs but never stored or refused by the render lattice.

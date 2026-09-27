---
'@embedpdf/engine-runtime': patch
---

Parses the numbers in PDF files faster, with identical values: a number written as an optional sign and at most 15 digits, with at most one decimal point, is decoded directly instead of through the general parser. Pages of CAD plots, whose content streams are mostly coordinates, parse 5–11% faster natively.

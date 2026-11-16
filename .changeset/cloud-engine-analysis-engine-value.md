---
'@cloudpdf/engine': patch
---

`doc.signatures.analyze()` no longer sends the number of its judging rules (`policy`), which a server on other rules refused: the verdict then read `'indeterminate'`. It sends the server's `analysis` engine value instead, so the answer for a saved version is still cached. It works with a server of 3.0 to 3.2 as it does with a newer one.

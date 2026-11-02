---
'@embedpdf/engine-core': minor
---

`scopeNotCovered(wanted, held)` returns what a scope would allow that another doesn't, in scope words (empty when `held` covers it). It compares capabilities with their implications, collab writes and their filters, `pdf.permissions` under every combination of a file's permission bits, and plugin permissions.

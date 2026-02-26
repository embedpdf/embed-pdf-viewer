---
'@embedpdf/plugin-redaction': patch
---

Fix annotation-mode `commitAllPending` to discover REDACT annotations from engine page annotations across the whole document before applying all redactions. This ensures all affected pages are refreshed instead of only pages present in local annotation state.

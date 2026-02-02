---
'@embedpdf/core': patch
---

Fixed AutoMount component to render utilities inside wrapper context. Utilities registered via `addUtility()` now have access to context provided by wrappers (React, Vue, Svelte), enabling plugins to share context between wrappers and utilities.

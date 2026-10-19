---
'@cloudpdf/server': minor
---

Every worker registers Noto Sans Hebrew and Noto Naskh Arabic as fallback fonts, tried after the deployment's own (`CLOUDPDF_FALLBACK_FONTS`), so Hebrew and Arabic draw with no setup. A key the deployment uses keeps its font.

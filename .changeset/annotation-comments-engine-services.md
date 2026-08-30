---
'@embedpdf/engine-services': minor
---

Read and write annotation subjects and text review states, preserve current
annotation state during sparse writes, and use `EPDFAnnot_SetRect` for moves
that must not regenerate appearances. Event delivery now reports gaps that
require a full client refresh.

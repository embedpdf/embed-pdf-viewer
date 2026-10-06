---
'@cloudpdf/engine': minor
---

Address annotations by their life-long ref on every call: updates, deletes and resource reads go to `obj:N` or `base:N`. Remove weak edit sessions (`doc.annotations.beginEdit`) and `capabilities`; a bare HTTP 409 maps to `LayerVersionConflict`.

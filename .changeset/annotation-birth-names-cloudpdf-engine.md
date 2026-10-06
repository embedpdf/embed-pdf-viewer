---
'@cloudpdf/engine': minor
---

Address annotations by their life-long ref on every call: updates, deletes and resource reads go to `obj:N` or `base:N`. Remove weak edit sessions (`doc.annotations.beginEdit`) and `capabilities`; a bare HTTP 409 maps to `LayerVersionConflict`.

Every write takes its options last, with an `opId`; the events of this session's writes carry it as `origin.tx`, and every event from another session carries one too. A create's bytes go in the options (`{ resources }`). `doc.objectNumbers` holds no numbers on this server yet, so a create that names one is refused with `ObjectNumberUnavailable`.

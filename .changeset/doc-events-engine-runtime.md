---
'@embedpdf/engine-runtime': minor
---

SubmitForm payload getters (Phase 4). `EPDFAction_GetNodeSubmitForm` (has-fields + the raw ISO Table-240 flag word; returns true only when the REQUIRED `/F` resolved to a URL — a `<< /FS /URL >>` file specification with `/UF` preferred over `/F` per 7.11.2, or a bare string `/F` accepted as a producer-compat extension), `EPDFAction_GetNodeSubmitFormURL`, and `EPDFAction_GetNodeSubmitFormCharSet` (PDF 2.0 `/CharSet`, extracted not encoded). `/Fields` entries ride the existing shared target storage (`GetNodeTargetCount`/`TargetName`/`TargetObjectNumber` now also answer for submit-form nodes) and the aggregate payload/target budgets. An unresolvable required component withholds the WHOLE payload — the reader degrades the node; never a half payload.

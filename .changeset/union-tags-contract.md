---
'@cloudpdf/contract': minor
---

The document init and import answers say what happened in `status` (`created`, `resumed` or `deduped`; `imported`, `deduped` or `accepted`), not `tag`, as every call's answer does. Form fields are tagged `kind` (was `family`) and a widget says `fieldKind`. The contract test checks that a union is tagged `type`, `kind`, `status` or `subtype`.

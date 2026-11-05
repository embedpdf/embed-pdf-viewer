---
'@cloudpdf/contract': patch
---

`openapi.json` writes a field's stored value and a measure out once, as `FormValueEntry` and `PdfMeasurement`, instead of once per field family and annotation kind, and each union and enum with a catch-all says what an unknown kind or value reads as. A new test fails when a union with a catch-all has no name in the contract, no row in the SDK checks' list or no fixture case. `SHARED_COMPONENT_SCHEMAS` is exported from `@cloudpdf/contract/openapi`.

---
'@cloudpdf/contract': minor
---

The annotation and form response schemas now describe action nodes as a payload-carrying discriminated union (`anyOf` in the emitted OpenAPI). Recursive `/Next` elements intentionally remain open (`{}`) in the emitted schema for Fern compatibility, so generated SDK types show `unknown[]` for nested chains.

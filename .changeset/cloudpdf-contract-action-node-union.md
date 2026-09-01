---
'@cloudpdf/contract': minor
---

The annotation and form response schemas now describe action nodes as a payload-carrying discriminated union exposed through reusable OpenAPI components. Recursive `/Next` elements intentionally remain open (`{}`) for Fern compatibility, so generated SDK types show `unknown[]` for nested chains without duplicating the action model for every response path.

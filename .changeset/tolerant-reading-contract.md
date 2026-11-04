---
'@cloudpdf/contract': patch
---

Every response schema reads tolerantly: none refuses a field it doesn't know, and every set it carries is marked closed or names what an unknown value reads as, which a new test checks for each operation. A request naming an `identity` is still parsed strictly, and the OpenAPI projection maps that strict twin to the same `Identity` component, so `openapi.json` is unchanged.

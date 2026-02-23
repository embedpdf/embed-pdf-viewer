---
'@embedpdf/plugin-annotation': minor
---

- Added support for rendering annotation appearance streams (AP) for better visual fidelity with other PDF viewers.
- Refactored annotation rendering to use a registry-based system, allowing for easier extensibility.
- Introduced `moveAnnotation` API to update annotation positions without regenerating their appearance streams.
- Added caching for rendered appearance streams.

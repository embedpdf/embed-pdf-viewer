---
'@embedpdf/engines': minor
---

Added support for creating and updating PDF link annotations with URI and internal page targets. Implemented IRT (In Reply To) and RT (Reply Type) property handling for annotation relationships and grouping. Refactored annotation content methods to use centralized `applyBaseAnnotationProperties` and `readBaseAnnotationProperties` helpers, reducing code duplication. Updated text markup and ink handlers to prefer `strokeColor` over deprecated `color` property.

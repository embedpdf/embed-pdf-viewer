---
'@embedpdf/plugin-scroll': minor
---

Added page elevation support driven by interaction manager page activity. New `elevated` boolean on `PageLayout` interface. Scroll plugin subscribes to `onPageActivityChange` and tracks elevated pages per document. Scroller components (React, Svelte, Vue) apply `zIndex: 1` and `position: relative` on page containers when `layout.elevated` is true. Added optional dependency on `@embedpdf/plugin-interaction-manager`.

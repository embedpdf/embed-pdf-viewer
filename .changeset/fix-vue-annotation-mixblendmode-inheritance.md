---
'@embedpdf/plugin-annotation': patch
---

Fixed Vue `AnnotationContainer` component where `mixBlendMode` style was incorrectly applied to the selection menu. The style now only applies to the annotation content div, matching the behavior of React and Svelte implementations. This was caused by Vue's attribute inheritance passing the style to the root element which wrapped both the annotation and the selection menu.

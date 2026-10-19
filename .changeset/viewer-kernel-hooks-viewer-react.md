---
'@embedpdf/viewer-react': minor
---

The children of `<PDFViewer>` mount once the viewer is ready, inside its kernel, so the headless hooks of `@embedpdf/react` (`useSearch()`, `useSearchState()`, …) work in your own components in the viewer. Install `@embedpdf/react` at the same version as the viewer.

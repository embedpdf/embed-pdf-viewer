---
'@embedpdf/viewer-react': minor
---

`@embedpdf/viewer-react/component` is the wrapper's door-blind parts (`<PDFViewer>` at the widest config, the slots, components and hooks), so a door in another package, such as `@cloudpdf/viewer-react`, narrows the same component to its own config. The `.` door's `<PDFViewer>` is narrowed to its `ViewerConfig` too, as the `./core` door's was: its props were the kernel's widest config.

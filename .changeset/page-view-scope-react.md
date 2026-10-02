---
'@embedpdf/react': patch
---

`<PageView>` without a `documentId` shows the document a `<DocumentScope>` around it names, like every other component, instead of always the active one. With the interaction plugin registered, a `<PageView>` is now the page's pointer surface by itself (below its layers, so links and form fields keep their presses), so text selection and annotation editing work in it without mounting `<PagePointerSource>` yourself.

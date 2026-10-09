---
'@embedpdf/viewer-chrome': patch
---

Follows the documents capability: the download command calls `documents.download()`, which runs the document's save actions itself, the download and print commands read `canDownload()` and `canPrint()`, and the tab bar and document panes read `useDocumentsState()`. `DocumentInfo` is exported (was `DocInfo`).

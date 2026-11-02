---
'@embedpdf/viewer-svelte': patch
---

`<PDFViewer appState>` follows its prop: a new value reaches the running viewer, and its commands
read it. Before, only the first one did: Svelte spread it onto the element as an `appstate`
attribute.

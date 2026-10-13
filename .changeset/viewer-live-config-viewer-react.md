---
'@embedpdf/viewer-react': minor
---

`<PDFViewer>` hands changes of `src`, `theme`, `locale`, `disable` and `readOnly` to the running viewer, which changes them in place: `src={file}` from a file input opens the picked file in place of the last one. Every other prop is still read once; the development warning now names only those. `onReady` gets the `Viewer` (`viewer.get('search')`, `viewer.documents`, `viewer.commands`), and the package exports the `Viewer` and `ViewerConfig` types.

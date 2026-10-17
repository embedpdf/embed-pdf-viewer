---
'@cloudpdf/viewer-react': minor
---

`<CloudPDFViewer>` makes its engine, documents and stamps once, when the viewer starts, and hands changes of `theme`, `locale`, `disable` and `readOnly` to the running viewer, so a re-render of your app no longer warns about a changed `engine`. Its props are the cloud's `ViewerConfig` (exported) and the wrapper's own: `scope` and `identity` are left out, since the document's token carries them.

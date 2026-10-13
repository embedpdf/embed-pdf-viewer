---
'@embedpdf/viewer': minor
---

`viewer.get('metadata')` is the metadata plugin, as Plugins lists it: the document's title, author and your own fields, read the first time something asks (`await viewer.get('metadata').ensureLoaded()`, or `useMetadataState()` in your components inside the viewer), never as a document opens.

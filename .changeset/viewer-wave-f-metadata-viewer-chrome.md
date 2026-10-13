---
'@embedpdf/viewer-chrome': minor
---

The viewer has the metadata plugin: `viewer.get('metadata')` is the document's title, author and custom fields, read the first time something asks (`await viewer.get('metadata').ensureLoaded()`, or `useMetadataState()` in your components), never as a document opens.

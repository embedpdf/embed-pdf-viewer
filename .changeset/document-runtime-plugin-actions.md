---
'@embedpdf/plugin-actions': minor
---

`documents.download()` and `downloadLayer()` run the document's save actions (WillSave, then the read, then DidSave) by themselves, so an app no longer wraps a download in `runDocumentVerb('save', …)`.

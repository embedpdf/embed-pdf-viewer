---
'@embedpdf/core': patch
---

An engine error saying the engine got an answer it doesn't understand (`WireFormat`, as from a server of another version) is `operation-failed`, not `invalid-input`: a document that fails to open that way no longer says its file isn't a PDF or is damaged.

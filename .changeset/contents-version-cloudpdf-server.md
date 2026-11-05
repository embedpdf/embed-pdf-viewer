---
'@cloudpdf/server': minor
---

Layers and base versions store `contents_version` (migration 052), raised in the same transaction as a flatten, a redaction or a change to the page set, and published in the manifest. Versioned searches pin it with `layoutVersion` instead of a content epoch, so an annotation write keeps every cached search and a content write refreshes them; the unversioned search form takes the same two pins as optional parameters.

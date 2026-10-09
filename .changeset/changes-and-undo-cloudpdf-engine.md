---
'@cloudpdf/engine': minor
---

Add `doc.apply(change, options)` to the cloud engine: each change takes its place in the document's line of writes, and changes called while an earlier write is in flight go out together as one `POST …/changes` (one request in flight per document, at most 64 changes each; a change carrying bytes goes in a request of its own). Each call resolves with its own answer, and a change and its undo can share a request. A change is checked against what a request may hold before it joins one, so a malformed change is refused alone. A request lost on the network goes again with the same `opId`s, and a change asked again gets the first answer without publishing its events twice.

Another session's changes arrive as the events of their items, and an undo's events carry `origin.undoOf`. Results' `meta` carry `opId` and `undoable`.

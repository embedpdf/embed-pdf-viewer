---
'@embedpdf/engine-services': patch
---

Undo fixes. Each op of a change converts to and from page space as it runs, so changes sent together (or ops of one change) that delete, make or bring back a page another one names apply instead of failing the job. Guards compare canonical bytes, which a save that only encodes a stream again, or the layer learning its file's hash, no longer changes: the undo of a page insert applies after the page was turned and turned back. The undo of opening an outline item counts the items above it again; the undo of a delete or move that emptied an open item opens it again; the undo of an item made applies after the page its target goes to was deleted; the undo of a retarget skips the target when its old page is gone. No outline item is made under the deepest item a read shows.

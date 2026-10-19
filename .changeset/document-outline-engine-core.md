---
'@embedpdf/engine-core': minor
---

Read and edit the document's outline (its bookmarks) with `doc.outline`: `get()` lists every item depth first with its parent, its target in page space (read the way a link's is), its `/A` action tree, its colour, its style and whether it opens; `create`, `update`, `move` and `delete` are change ops (`outline.create`, `outline.update`, `outline.move`, `outline.delete`) that apply through `doc.apply`, undo by reference, and publish `outline.created`, `outline.updated`, `outline.moved`, `outline.deleted` and `outline.restored` events. Items are named by object number and placed by neighbour (`OutlinePosition`); a delete takes the items under an item with it, and its undo brings the same items back. Writing needs the new `doc.outline.modify` capability (granted by the PDF's modify or assemble right, and protected by certifying signatures).

`outlineItemOfDraft`, `outlineItemAfter` and `outlineItemWithChildren` work out what an outline write leaves before the engine runs it, and `runOutlineConformance` checks both engines against them. `actionTreeOf` gives the action tree a link target is written as. The cloud wire carries the outline plane: `LayerScopes.outline`, `outlineVersion` in the manifest and in `CacheDelta`, and the `outline` and `layer-outline` resources.

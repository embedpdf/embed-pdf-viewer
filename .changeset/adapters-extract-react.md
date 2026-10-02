---
'@embedpdf/react': patch
---

The annotation, form, link, selection, search, page view, toolbar, stamp and command bindings now use the shared browser implementations in `@embedpdf/web`, with no change in behavior. `enrichCommentThreads`, `sameAnchor` and `sameCreationDraftAnchor` are no longer exported from `@embedpdf/react/annotation`: use `enrichCommentThreads`, `sameSelectionAnchor` and `sameCreationDraftAnchor` from `@embedpdf/web`.

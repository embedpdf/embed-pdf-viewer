---
'@embedpdf/engine-core': minor
---

Add `AnnotationAuthority`, with `authorizeAnnotationUpdate` and `authorizeAnnotationDelete`: an annotation update or delete carries who it acts for and the caller's grants, and the engine checks them against the annotations the write finds, inside the write. The `annotations.update` and `annotations.delete` worker requests take `authority` in place of `actor` and `checked`.

Remove `SessionKind`: every document opens as an immutable base with an editable layer.

`PageFlattenResult` and `RedactionApplyResult` report each page as `'applied'` or `'unchanged'` only: the `'failed'` and `'skipped'` statuses and the per-page `error` are gone, because a page that fails now fails the whole call.

An annotation's ref is its name for life, in one of two kinds: `{ kind: 'objectNumber', page, objectNumber }`, or `{ kind: 'baseIndex', page, baseIndex }` for an annotation the uploaded file stores inline, named by the position it was born at in its page's `/Annots`. Remove the `index` and `nm` ref kinds; an annotation's `nm` is data only. `AnnotationRef` replaces `AnnotationStableId` everywhere: `meta.changed` and the `annotations.deleted` event's `deleted` are `AnnotationRef[]`, `annotationKey(ref)` is the one string key (`obj:42`, `base:<page>:<i>`), and `encodeAnnotKey`/`decodeAnnotKey` give a route's `:annotKey` (`obj:42`, `base:2`).

Remove page revisions and weak annotations: `PageState`, `identityQuality`, `weakRefsInvalidated`, `shouldRefetch`, weak edit sessions (`doc.annotations.beginEdit`, `DocumentHandle.capabilities`) and the `InvalidReference` and `WeakAnnotationSessionConflict` error codes. `meta.affectedPages`, `AnnotationList.pages` and an appearance result's `page` are `PageRef`s; a manifest page is `{ page, cache }`.

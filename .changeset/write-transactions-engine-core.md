---
'@embedpdf/engine-core': minor
---

Add `AnnotationAuthority`, with `authorizeAnnotationUpdate` and `authorizeAnnotationDelete`: an annotation update or delete carries who it acts for and the caller's grants, and the engine checks them against the annotations the write finds, inside the write. The `annotations.update` and `annotations.delete` worker requests take `authority` in place of `actor` and `checked`.

Remove `SessionKind`: every document opens as an immutable base with an editable layer.

`PageFlattenResult` and `RedactionApplyResult` report each page as `'applied'` or `'unchanged'` only: the `'failed'` and `'skipped'` statuses and the per-page `error` are gone, because a page that fails now fails the whole call.

An annotation's ref is its name for life, in one of two kinds: `{ kind: 'objectNumber', page, objectNumber }`, or `{ kind: 'baseIndex', page, baseIndex }` for an annotation the uploaded file stores inline, named by the position it was born at in its page's `/Annots`. Remove the `index` and `nm` ref kinds; an annotation's `nm` is data only. `AnnotationRef` replaces `AnnotationStableId` everywhere: `meta.changed` and the `annotations.deleted` event's `deleted` are `AnnotationRef[]`, `annotationKey(ref)` is the one string key (`obj:42`, `base:<page>:<i>`), and `encodeAnnotKey`/`decodeAnnotKey` give a route's `:annotKey` (`obj:42`, `base:2`).

Remove page revisions and weak annotations: `PageState`, `identityQuality`, `weakRefsInvalidated`, `shouldRefetch`, weak edit sessions (`doc.annotations.beginEdit`, `DocumentHandle.capabilities`) and the `InvalidReference` and `WeakAnnotationSessionConflict` error codes. `meta.affectedPages`, `AnnotationList.pages` and an appearance result's `page` are `PageRef`s; a manifest page is `{ page, cache }`.

Every write takes its options last: `WriteOptions`, with an `opId` that names the write. Every event a write publishes carries it as `origin.tx`, `{ id, index, count }`; without one the engine makes one up. An `opId` is 1 to 255 visible ASCII characters (`opIdOf` checks it), on every engine. A create's bytes move into the options: `page.annotations.create(data, { resources, objectNumber, opId })` and `update(ref, patch, { resources, opId })`, in place of a positional `resources`.

Name objects before they exist. `DocumentHandle.objectNumbers` is the session's `ObjectNumberPool` (`take()`, `held`, `reserve(count)`, `onLost(listener)`). A create that names one of its numbers makes its object at exactly that number: `page.annotations.create(data, { objectNumber })`, `pages.insertBlank(spec, toIndex, { objectNumbers })`, `forms.create(draft, { objectNumber, widgetObjectNumbers })` and `forms.addWidget(ref, placement, { objectNumber, splitObjectNumber })`. Add the `ObjectNumberUnavailable` error (`details.reason` `'not-held'` or `'taken'`) and `LayerFull`, past `OBJECT_NUMBER_CEILING`; `ObjectNumberRange`, `objectNumbersIn` and `OBJECT_NUMBER_ISSUE_LIMIT`; the `objectNumbers.reserve` worker request, and the open requests' `objectNumbers` and `reserveObjectNumbers`.

Add `generateUuidV7`. A prediction (`annotationOfDraft`) takes the engine's `nm` from its context, like the ref. Add `runObjectNumberConformance`.

Add the cloud editing session to the wire: `formatObjectNumberRanges` and `parseObjectNumberRanges` (the `EmbedPDF-Object-Numbers` header), `EditSessionAccess` (`DocumentAccessInfo.edit`), `EditSessionStatus` (the event stream's `session` event), the access request's `objectNumbers`, and the bulk reservation's schemas and `wirePaths.objectNumbers`. Worker write requests take `objectNumberFloor`; opens, saved layer artifacts and `signatures.finalizeCandidate` report `lastObjectNumber`.

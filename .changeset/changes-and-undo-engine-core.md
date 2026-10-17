---
'@embedpdf/engine-core': minor
---

Add changes: `doc.apply(change, options)` applies one user action as one transaction, its ops in order, all of them or none. A `Change` is `{ ops }` or `{ undoOf: opId }`; `ChangeOp` takes exactly the parameters of each single verb (annotations create, update, delete and move; form values, display, appearance text, reset, field create, update and delete, widget add and remove, signature appearance; metadata and custom metadata), with an optional `expect` that refuses the whole change with the new `ChangeConflict` when the document doesn't hold it. `ChangeResult` has one `ChangeItem` per op and the change's `meta`; an undo's items report what it left alone in `skipped`, and `annotations.restore` and `forms.restore` items name what came back. Add `isUndoChange`, `resolveChangeResources` and `changeEvents` (the events a change publishes, in op order).

Every write's `meta` carries `opId`, the write's id (what `{ undoOf }` names), and `undoable`. Add the `annotations.restored` and `forms.restored` events, and the `UndoUnavailable` and `IdempotencyKeyReused` error codes.

Add `ChangeAuthority` (an `AnnotationAuthority` with the document's signature `protection`), `authorizeCapability`, `authorizeUnprotected` and `authorizeAnnotationCreate`, so a write checks each of its ops inside the write. Add `annotationResourceBuffers`. Worker write requests require `opId`; add the `document.apply` worker request.

Add `runChangeConformance` and `CHANGE_FIXTURE_PDF`.

An undo's items report what it left alone: an op left alone entirely is a `SkippedChangeItem`, `{ type: 'skipped', op, meta }` naming the item it would have been (`isSkippedItem`), and an update item (`annotations.update`, `forms.update`, `forms.reset`, metadata) lists in `skipped` what it left alone. Add `ChangeItemType`, `changeFingerprint` (what a retry under the same `opId` must match) and `isKeptRefusal` (the refusals a change keeps under its `opId`). `AppearanceAction` gains `'restored'`: an undo put the appearance back as it was.

Add the `POST …/changes` wire: `ChangeRequestSchema`, `ChangeResponseSchema` (with `ChangeOpWireSchema`, `ChangeEntryWireSchema`, `ChangeItemSchema`, `ChangeResultSchema`, `ChangeAnswerSchema`), `CHANGE_REQUEST_LIMITS`, and `wirePaths.layerChanges` / `wireTemplates.layerChanges`. Add the `document.applyChanges` worker request, which runs a request's changes in one job, each in its own transaction, and answers each with its result and record or its refusal.

Add stable public component names for OpenAPI projections, like `AnnotationWireComponents`: `DocumentWireComponents` (`PageRef`, `CacheDelta`, `MutationMeta`, `DocumentMetadata`, `MetadataPatch`), `FormWireComponents` (`FormFieldRef`, `FormField`, `FormFieldValue`, `FormWidget`, `FormFieldDraft`, `FormFieldPatch`, `WidgetPlacement`, `FormMutationMeta`) and `ChangeWireComponents` (`ChangeOp`, `ChangeItem`, `ChangeResult`). `AnnotationWireComponents` gains `AnnotationRef`, `AnnotationDraft`, `AnnotationPatch`, `PdfLinkTarget` and `PdfLinkTargetWritable`.

`FormFieldValueSchema` is one object holding exactly one of `value`, `checked` or `selectedValues`, and a `POST …/changes` entry one object holding exactly one of `ops` or `undoOf`, so the API reference can label every union; the `FormFieldValue` type is unchanged.

Add `ChangeAnswer` (one change's answer from the server, applied or refused) and `objectNumbersNamedBy(change)`. `EventOrigin` gains `undoOf`: on the events of an undo, the `opId` of the change it undid.

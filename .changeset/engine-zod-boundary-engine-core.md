---
'@embedpdf/engine-core': minor
---

zod stays off the page. The root entry, `@embedpdf/engine-core/runtime` and `@embedpdf/engine-core/public` no longer import zod or build any schema, so an app's bundler never sees it on the main thread. The checks the engine runs where it runs, in its worker and on the server, move to a new entry, `@embedpdf/engine-core/validation`, built with zod:

- `assertAnnotationDraft`, `pdfResolveAnnotationDraft`, `pdfResolveAnnotationPatch`, `planAnnotationImport`, `planFormImport` and `planFormValuesImport`, with the types `AnnotationImportPlan`, `PlannedAnnotation`, `FormImportPlan`, `PlannedFormField`, `PlannedValueWrite` and `FormValuesImportTarget`, are exported from `@embedpdf/engine-core/validation` instead of `/runtime` and the root entry;
- `assertAnnotationPatch`, the update check `pdfResolveAnnotationPatch` runs, is exported there too. Like `assertAnnotationDraft`, it only accepts or refuses.

`annotationImportFacts`, `formImportFacts` and `formValuesImportFacts` stay in `/runtime`.

`annotationOfDraft`, `resolveAnnotationDraft`, `resolveAnnotationPatch` and `applyAnnotationPatch` predict a write without schema validation: what a viewer shows while a write is on its way. They prepare and derive a write with the same code the engine runs, and the engine's schema check between the two only accepts or refuses, so the engine writes what the viewer predicted. They still refuse, with `InvalidArg`, a field the kind doesn't declare, a changed subtype or `nm`, a `rect` with a new shape, a box kind that can't be placed, and what nothing can follow from; a value only the schema refuses (a color that isn't `'#rrggbb'`, an opacity above 1) is refused by the engine when the write reaches it, and a pending change it refuses leaves the view as any refused change does. A field an update sends back as it reads is not a change: the page and the engine both drop it, so nothing follows from it (a measured polygon that resends its vertices with a new color keeps its caption). A changed value stays, and the engine refuses one its kind can't write.

Rects are finite everywhere: a rect or box with `Infinity` or `NaN` in it is refused, with `InvalidArg` on `rect`, by the prediction (`resolveRectCommand`, a box kind placed by its `rect`), by the engine's schemas, and by the wire's `PdfRectSchema` and `PageBoxSchema`, which used to accept `Infinity`.

`ANNOTATION_RESOURCE_ROLES` has an entry for every kind (`{}` for a kind that takes no resources).

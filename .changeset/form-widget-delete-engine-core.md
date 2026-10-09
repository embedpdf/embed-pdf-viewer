---
'@embedpdf/engine-core': minor
---

- **`doc.forms.deleteWidget(widget)`** deletes a widget: it leaves its page, and its field when it has one, and answers that field (`null` for a widget in no field). A merged field/widget is refused with `InvalidArg` naming `doc.forms.delete`. The change op `forms.deleteWidget` (with `expect`) is undone by `forms.restoreWidget`, which brings the widget back at its place and into its field; events `forms.widgetDeleted` and `forms.widgetRestored`.
- **Annotation import leaves out every widget**, in a field or not: the drop reason `'form-field'` is now `'widget'`.
- **Conformance:** `runWidgetFindingConformance` (where the form finds a widget in awkward files: only in `/Annots`, inline, no `/AcroForm`, a stale `/P`, a deleted page, no field type) and `runPermissionConformance` (reads, appearance images, pictures, writes and events through an everything, a fill-only and a comment-only token). `pdfOf` is exported for tests.

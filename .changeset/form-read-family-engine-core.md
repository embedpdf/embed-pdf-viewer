---
'@embedpdf/engine-core': minor
---

A form field's widgets come with the form, never with the annotations:
- **`doc.forms.list()` returns `widgets`:** every widget's row (place, look, state and its `field`), beside the fields. `doc.annotations.list()` and `page.annotations.list()` hold every annotation except widgets. `FormFieldWidget` loses `rect`; read a widget's place from its row. `SignatureDTO.widget` loses it too, and the signature types are no longer generic.
- **`page.forms.renderAppearances()`** renders a page's widget images, every mode and state; `page.annotations.renderAppearances()` renders the rest.
- **`doc.forms.updateWidget(widget, patch)`** and the `forms.updateWidget` change op change a widget's place and look, with `forms.widgetUpdated`. `annotations.create`, `annotations.update` and `annotations.delete` refuse widgets with `InvalidArg`.
- **Form results carry the widget rows they changed** (`widgets`), and `forms.restored` too.
- **Pins and planes:** `DocumentManifest.formsVersion`, `CachePins.widgetVersion`, `CacheDelta.formsVersion` and a `forms` plane in `LayerScopes`. New read families `form@` and `form/pages/{p}/appearances@` (resources `form`, `page-form` and their layer twins, `doc.forms.read`), with their tokens, paths and query schemas.
- `AnnotationFamily` and `familyOfSubtype`; the conformance suites read widgets from the form.

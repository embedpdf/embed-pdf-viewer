---
'@cloudpdf/server': minor
---

The form is its own read family:
- **New routes:** `form@{formsVersion}` and `form/pages/{p}/appearances@{widgetVersion}`, each with its layer twin (and an unversioned layer appearance route), needing `doc.forms.read`; `PATCH …/form/widgets/{pageKey}/{annotKey}` (`doc.forms.updateWidget`).
- **Pins:** migration 034 adds `layers.forms_version`, `base_versions.forms_version` and `widget_version` on page rows. Form writes move the form's pins, never the annotation pins; annotation writes the reverse. Page insert/delete, flatten and redaction move both. Plane scopes compare the document pins too, and gain `forms`.
- Annotation reads and appearance batches hold no widgets.

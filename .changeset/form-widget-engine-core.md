---
'@embedpdf/engine-core': minor
---

`FormWidgetRef` is now `FormWidget`: a widget as the field tree sees it, carrying `ref: AnnotationRef | null`, the widget's annotation address computed once by the engine (present exactly when the widget is an indirect object placed on a page). `formWidget(objectNumber, page)` is the one constructor. `forms.removeWidget` takes the widget's `AnnotationRef` instead of a raw record, and `forms.addWidget` takes a placement and creates the widget.

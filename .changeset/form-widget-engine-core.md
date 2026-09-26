---
'@embedpdf/engine-core': minor
---

`FormWidgetRef` is now `FormWidget`: a widget as the field tree sees it, carrying `ref: AnnotationRef | null`, the widget's annotation address computed once by the engine (present exactly when the widget is an indirect object placed on a page). `formWidget(annotObjectNumber, page)` is the one constructor. `forms.attachWidget` and `forms.detachWidget` take the widget's `AnnotationRef` instead of a raw record.

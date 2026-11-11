---
'@embedpdf/plugin-form': minor
---

New `duplicate(fields, { page?, offset?, values? })` copies whole fields: each copy is a new field named after its original (`email_2`), with its settings, scripts and widgets, and no answer unless `values` is true. New `duplicateWidgets(widgets, options)` copies widgets as Duplicate does in a form designer: a radio button's copy is another button of its group, with the next free `Choice<n>`, and any other widget's copy is a new field; widgets of one field copied together become one new field. Both show their copies at once, are one step to undo, and resolve `{ fields, widgets, dropped }`. In design mode the annotation plugin's `selection.duplicate()` copies the selected widgets through this plugin. `addWidget()` now shows its new widget before the engine answers. `getSelectedField()` is also the field when several of its widgets are selected, such as a radio group's buttons.

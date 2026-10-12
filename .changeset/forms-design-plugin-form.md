---
'@embedpdf/plugin-form': minor
---

- Building the form is on the change queue: `create()`, `update()`, `delete()`, `deleteWidget()`, `removeWidget()` and `reorderCalculations()` each show at once, are one step to undo, and resolve with the engine's answer. A new field takes its final refs from its first frame.
- `updateWidget(widget, patch)`: change one widget's place or look.
- `getFieldSettings(field)`: a field's settings described for a settings panel (`{ properties, values }`), written with `update()`.
- Design mode: the form lends its widgets to the annotation plugin, which edits them with its own tools; deleting every widget of a field deletes the field. In fill mode nothing is lent and the form layer draws every widget. `listShownWidgets()` is empty while the widgets are lent. Both modes draw the widgets' pictures from the render plugin (now an optional sibling), so switching modes fetches nothing.
- The palette selects a field it placed at once, and gains a push button tool (`form-button`).

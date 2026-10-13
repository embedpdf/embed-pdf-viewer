---
'@embedpdf/plugin-form': minor
---

`addWidget(ref, placement?)` shows a field in one more place: a radio group's next choice (the next free `Choice<n>`) or a checkbox's next box, which checks together with the others. Without a place it goes next in line after the field's widgets: below them while they stand in a column, beside them while they stand in a row, the same size and step, a new column where the page ends. It looks like the field's last widget, and resolves `{ field, widget }`; a merged field splits.

After a field tool places a field, the tool goes back to design's `form-edit` rather than the default pointer (with `afterCreate.tool: 'default'`), so design goes on and the field stays selected. The plugin looks its siblings up when it uses them, not once as it's created, so design mode finds the annotation plugin however the plugins came to be built. After a merged field splits, its old row goes from `getWidgets()` and the page's widgets.

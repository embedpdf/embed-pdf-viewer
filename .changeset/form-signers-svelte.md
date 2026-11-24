---
'@embedpdf/svelte': minor
---

`<FormLayer>` shows the fields a user may fill in in their group's color, and `<AnnotationLayer>` shows every field in its group's color in design mode. Name a document's groups with `form.setGroups()`. `useFormState()` gains `groups`, `designGroup` and `selectedFields`, and `useFormEvent()` takes `onGroupsChanged` and `onDesignGroupChanged`. A document whose fields are in no group draws as before; set the form's `fields.tint` to `0` to show no group's color.

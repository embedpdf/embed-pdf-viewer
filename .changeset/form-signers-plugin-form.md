---
'@embedpdf/plugin-form': minor
---

Say who a document's groups are, place fields for each of them, and give existing fields to them.

- `setGroups([{ id, label, color }])` names the groups of the open document: the whole list, and an empty one clears it. A group is an id in the PDF; its label and its color stay in the app, and each open document has its own list. `color` is a CSS color, so it can be `var(--yours)`. Fires `onGroupsChanged`; the same list again changes nothing.
- Every group a document's fields are in shows in a color, named or not: the app's, else one of eight by the group's place in the list, so the first eight never share one. `fields.tint` (default `0.16`, CSS `--epdf-form-field-tint`) is how strongly it shows, and `0` turns the colors off. A document whose fields are in no group looks as it did. A document whose fields are in groups now shows them in color: set `formPlugin({ fields: { tint: 0 } })` to keep the old look.
- `listGroups()` gives every named group, then every other group the form's fields are in, as `{ id, label, color }`. The form's state has them as `groups`.
- Who new fields are placed for is state: `setDesignGroup(groupId)`, `getDesignGroup()`, `designGroup` in the form's state, and the event `onDesignGroupChanged`. A field placed with a form tool goes into that group; with `null`, where it starts, it is in no group.
- `moveToGroup(fields, groupId)` puts several fields in a group, or with `null` takes them out of theirs, as one step to undo, and `listSelectedFields()` (the state's `selectedFields`) gives every field with a selected widget in design mode.
- `canSetGroup(groupId)` says whether the user may put a field in a group: `doc.forms.modify`, and the group is their own or one a `fields:set-group` permission names. `setDesignGroup()`, `moveToGroup()`, and `create()` and `update()` with a `groupId`, refuse such a group before anything is shown, with `permission-denied`; the engine refused it before, after the field had shown. Taking a field out of its group (`groupId: null`) needs `doc.forms.modify` alone.
- `getFieldSettings()` describes a field's group while the document has groups: a `choice` with the key `groupId`, whose options are the ids of the groups the user may put the field in; none of them (`null`) takes the field out of its group.
- Each entry of `listWidgets()` gains `accent`: `{ color, strength }`, its group's color and the tint, while the user may fill the field in and it still takes a value, else `null`. Its `label` ends with the group's label when the group has one (`Signature, Dana Smith`), after a radio button's option (`Plan: monthly, Dana Smith`).
- In design mode each field lent to the annotation plugin carries the same `accent`, so the annotation layer shows whose field it is. No color is written into the PDF.

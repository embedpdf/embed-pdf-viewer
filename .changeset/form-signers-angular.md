---
'@embedpdf/angular': minor
---

`<epdf-form-layer>` shows the fields a user may fill in in their group's color, and `<epdf-annotation-layer>` shows every field in its group's color in design mode. `EpdfForm` gains `setGroups()`, `listGroups()`, `getDesignGroup()`, `setDesignGroup()`, `moveToGroup()`, `listSelectedFields()`, `canSetGroup()`, the signals `groups()`, `designGroup()` and `selectedFields()`, and the streams `groupsChanged$` and `designGroupChanged$`. A document whose fields are in no group draws as before; set the form's `fields.tint` to `0` to show no group's color.

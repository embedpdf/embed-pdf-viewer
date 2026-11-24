---
'@embedpdf/engine-core': minor
---

A new form field is in no group unless its draft names one, and `groupId: null` takes a field out of its group. Both engines follow the same rule.

**This changes what a create does.** Until now a field created without a `groupId` went in the session's own group (`identity.groupId`). It is now in no group. Only a session whose identity has a group, and that creates a field without naming one, sees a difference. To keep the old result, name the group in the draft: `doc.forms.create({ kind: 'text', name: 'note', groupId: 'legal', widgets })`. Naming your own group still takes no `fields:set-group` permission. Documents that already exist don't change, and annotations keep their rules: a new annotation still goes in its creator's group, and its group can't be removed.

- `FormFieldDraft.groupId` and `FormFieldPatch.groupId` are `string | null`. In a draft, `null` means the same as leaving it out. In a patch, `null` takes the field out of its group. That takes form design (`doc.forms.modify`) and no `fields:set-group` permission. A field's group used to be documented as "changed, never removed".
- `FormFieldDraftSchema` and `FormFieldPatchSchema` take `groupId: null`, so a request to the cloud engine does too.
- `authorizeFieldGroup()` takes `null`, which needs no right.
- `formFieldOfDraft()` gives a field in no group for a draft that names none. `FieldDraftContext.groupId` is deprecated and no longer read. It goes in 4.0.
- `runFieldGroupsConformance` checks the default, `null` in a draft and in a patch, the right each one takes, and undo.

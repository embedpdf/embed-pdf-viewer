---
'@embedpdf/engine-services': minor
---

Write a form field's group by one rule on the local and the cloud engine: a new field is in no group unless its draft names one, and `groupId: null` takes a field out of its group.

**This changes what a create does.** A field created without a `groupId` used to go in the session's own group (`identity.groupId`). It is now in no group. Only a session whose identity has a group, and that creates a field without naming one, sees a difference. To keep the old result, name the group in the draft. Copies follow the same rule: `forms.copy`, and an import with `attribution: 'stamp'`, leave a field that was in no group in none, where it used to go in the caller's own group.

- `groupId: null` in `forms.update` takes the field out of its group. It takes `doc.forms.modify` and no `fields:set-group` permission. Before, the local engine removed the group only for a session with `fields:set-group:all` and refused the others with `fields:set-group:group=null`, and the cloud engine refused the request.
- Undo of an update puts a removed group back and takes an assigned one away. When the field was changed in between, undoing an assignment used to leave the field in the group.
- An update's `expect: { groupId: null }` matches a field in no group.
- The local engine refuses a `groupId` that is empty or longer than 256 characters with `InvalidArg`, as the cloud engine does. It used to write an empty one, which read back as no group.

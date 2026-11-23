---
'@cloudpdf/contract': minor
---

`groupId` in a form field's draft and patch takes `null`: `FormFieldDraft` and `FormFieldPatch`, as the `forms.create` and `forms.update` ops of `doc.changes` carry them. In a draft, `null` means the same as leaving it out. In a patch, it takes the field out of its group, which needs `doc.forms.modify` and no `fields:set-group` permission.

A field created without a `groupId` is now in no group. It used to go in the token's own group (`identity.groupId`), so only a token whose identity has a group sees a difference. To keep the old result, name the group in the draft.

The new default comes with the server, not with the client: a server of this release gives it to every client, also one that says it speaks 3.0 to 3.3. A server older than this release refuses `groupId: null` with `InvalidArg`.

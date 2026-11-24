---
'@cloudpdf/sdk': minor
---

`groupId` on `FormFieldDraft` and `FormFieldPatch` is `string | null`. In a `forms.create` op, `null` means the same as leaving it out: the field is in no group. In a `forms.update` op, `null` takes the field out of its group.

A field created without a `groupId` is now in no group. It used to go in the token's own group (`identity.groupId`), so only a token whose identity has a group sees a difference. To keep the old result, name the group in the draft.

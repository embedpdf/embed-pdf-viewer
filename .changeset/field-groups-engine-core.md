---
'@embedpdf/engine-core': minor
---

Field groups: each form field can belong to a group, its `groupId`. The group is who fills the field in, such as the buyer's fields, and is stored in the field's `/EMBD_Metadata /GroupID`.

- **Fields:** a field's `groupId` is on `FormFieldDTO`, its draft and its patch. A new field goes in the session's own group (`identity.groupId`) unless the draft names another. A group can be changed, never removed. Widget rows report no group.
- **Scopes:** `fields:<fill|sign|set-group|*>:<all|group=X>`, with `collab.fields.*` builders. A `fields:fill` scope narrows filling in, and `fields:sign` narrows signing, per action as for annotations. Form design (`doc.forms.modify`) is never narrowed, and `pdf.permissions` stays what the file allows. Any `fields:` scope lets the holder read the form.
- **Checks:** `checkFieldAction`, `checkAnyFieldAction`, `authorizeFieldWrite`, `allowsFieldWrite`, `allowsSomeFieldWrite` and `authorizeFieldGroup`. `checkSetGroup` now takes the entity first: `checkSetGroup('fields' | 'annotations', group, own, scope)`.
- **Security service:** `doc.security.allowsField('fill' | 'sign', field)` and `allowsField('set-group', { groupId })`.
- **`group=X` compares only the record's group:** the session no longer has to be a member. `Identity.groups` is removed.
- **Values import:** a values import leaves out a field the session may not fill in, with the reason `fill-not-allowed`.
- **Worker protocol:** the form fill, design and signing jobs carry the caller's `authority` instead of an `actor`.
- **Conformance:** `runFieldGroupsConformance` runs a buyer and seller contract (`FIELD_GROUPS_PDF`, `FIELD_GROUP_TOKENS`).

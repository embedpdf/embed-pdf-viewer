---
'@embedpdf/engine-services': minor
---

A form write checks each field against the caller's groups.

- **Filling in:** a value or displayed text, each field a reset puts back, and the undo of a fill, need the field's group. A field a script calculates, or a script's show or hide, is allowed when the same change fills one of the caller's own fields.
- **Signing:** the signature look, `signatures.prepare` and `complete` need `sign` on the field's group.
- **Groups:** creating or moving a field, and copying a form bundle in, need `set-group` for a group other than the caller's own. A restoring import keeps each field's group.
- **Values import:** a values import leaves out the fields the caller may not fill in.
- **Default lock:** signing a signature field in a group, without a `lock`, locks the group's other fields as they are at signing, but not its signature fields. A field's group is read from and written to its `/EMBD_Metadata /GroupID`.

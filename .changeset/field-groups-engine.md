---
'@embedpdf/engine': minor
---

Field groups on the local engine:

- The form and signing verbs send the handle's grants with the write, which checks each field. Filling in and signing need `doc.forms.fill` / `doc.sign` or a `fields:` scope for some group.
- `doc.security.allowsField(...)` answers per field.
- `open()` no longer asks for `identity.groups` with a `:group=` scope.
- `forms.applyEffects` needs a filler of every field.

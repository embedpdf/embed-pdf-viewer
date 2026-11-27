---
'@embedpdf/engine': minor
---

A form field's `assignment` says who fills it in: one group's signers, anyone, or no one in particular. `doc.forms.create()` and `doc.forms.update()` take it, every read returns `field.assignment`, and `doc.security.allowsField('fill', field)` answers for it. Every signer may fill in a field anyone fills in, whatever group their permission names.

```ts
await doc.forms.create({
  kind: 'text',
  name: 'delivery.date',
  assignment: { kind: 'anyone' },
  widgets,
});
await doc.forms.update(field.ref, {
  assignment: { kind: 'group', groupId: 'buyer' },
});
```

`groupId` stays: it reads the group's id (`null` for anyone and unassigned), and writing it works from any assignment, a group id for that group and `null` for unassigned. A write names one of the two: both, or anyone on a signature field, fail with `InvalidArg`. Giving a field to anyone takes `fields:set-group:all`. A signature without a `lock` of its own locks every field anyone fills in that holds a value at that signing, beside the rest of the signer's group; one still empty stays open for the next signer. A document in which no field is anyone's behaves as before.

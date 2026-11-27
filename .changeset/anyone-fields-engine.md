---
'@embedpdf/engine': minor
---

A form field can be one anyone fills in: `doc.forms.create({ …, forAnyone: true })` and `doc.forms.update(ref, { forAnyone })`, and every read returns `field.forAnyone`. Every signer may fill in such a field, whatever group their permission names, and `doc.security.allowsField('fill', field)` answers for it.

```ts
await doc.forms.create({
  kind: 'text',
  name: 'delivery.date',
  forAnyone: true,
  widgets,
});
await doc.forms.update(field.ref, { groupId: null, forAnyone: true }); // from a group
```

A signature without a `lock` of its own locks every such field that holds a value at that signing, beside the rest of the signer's group; one still empty stays open for the next signer. Marking a field takes `fields:set-group:all`. A field in a group and a signature field are never `forAnyone`: both fail with `InvalidArg`. A document in which no field is marked behaves as before.

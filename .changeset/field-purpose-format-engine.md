---
'@embedpdf/engine': minor
---

A form field has a `purpose` (what its value means, such as `'email'`), and a text field or a dropdown a `format`: `doc.forms.create()` and `doc.forms.update()` take both, and every read returns them.

```ts
await doc.forms.create({
  kind: 'text',
  name: 'signed_on',
  purpose: 'date-signed',
  format: { kind: 'date', pattern: 'dd/mm/yyyy' },
});
```

A date or a time format is written as the scripts Acrobat writes for one, so Acrobat offers its date picker on the field, and a date field made in Acrobat reads as `{ kind: 'date', pattern }` here. It needs `doc.forms.modify` and no `doc.forms.script`. `isDatePattern()` and `isTimePattern()` say whether a string is a pattern a date or a time format is written with, and `STANDARD_DATE_PATTERNS` and `STANDARD_TIME_PATTERNS` are Acrobat's own lists of them.

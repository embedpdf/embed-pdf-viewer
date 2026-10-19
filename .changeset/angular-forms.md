---
'@embedpdf/angular': minor
---

Forms and signatures in Angular: `@embedpdf/angular/form` and `@embedpdf/angular/signature`.

- `withForm(config)` and `inject(EpdfForm)`: the plugin's methods for reading, filling, form
  data and building (`setValue()`, `importValues()`, `export()`, `validate()`, `create()`,
  `update()`, `delete()`, …), the State table as signals (`fields()`, `status()`, `formKind()`,
  `selectedField()`), every event as a stream (`valueChanged$`, `validationRejected$`,
  `fieldCreated$`, …) and the settings. The checks (`canFill()`, `canDesign()`) follow the
  document in a template.
- `form.valueOf(ref)` is one field's value as a signal, which wakes only when that field
  changes. `form.controlOf(ref)` is a field as a Reactive Forms `FormControl` for an input of
  your own (`<input [formControl]="name" />`): it holds the field's value, takes every change
  of it, fills in the field with the form's checks and scripts when it changes, and is disabled
  while the field can't be filled in. It needs `@angular/forms`, now an optional peer
  dependency.
- `<epdf-form-layer>` puts a real HTML control over each field on its page: a text box that
  edits in the field's font, checkboxes and radio buttons, a dropdown, a list that keeps its own
  scroll position, push buttons that run their action, and "sign here" on a signature field
  with the signature plugin. A press on a field stays out of the page below and still reaches
  the field's PDF actions; the colors follow the form settings and the `--epdf-form-*` CSS
  variables.
- `withSignature(config)` and `inject(EpdfSignature)`: signing, filling and checking signature
  fields (`sign()`, `placeMark()`, `fillField()`, `validate()`, …), `signatures()`,
  `protection()`, `target()`, `busy()`, `pending()` and `status()` as signals, the events as
  streams (`signed$`, `invalidationPredicted$`, `targetChanged$`, `signRequested$`, …), the
  settings, and `signerRows()`: the people whose marks the stamp plugin holds, each with their
  signatures and initials. The signers (`webCryptoSigner`, `remoteSigner`, `personalSigner` with
  `indexedDbKeyStore`, `createTestSigner`) come with the entry.

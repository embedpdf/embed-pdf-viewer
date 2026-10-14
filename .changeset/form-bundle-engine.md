---
'@embedpdf/engine': minor
---

`doc.forms.export(selection)`, `doc.forms.import(bundle, options)` and `doc.forms.importValues(bundle, options)` replace the FDF/XFDF `export(format)` and `import(bytes)`, with the permission checks of each (`doc.forms.import` to restore attribution; without `doc.forms.script`, scripts, submits and links are left out). An import fires one `forms.created` or `forms.valueSet` per field. `FormTransfer` stores a bundle as one JSON file.

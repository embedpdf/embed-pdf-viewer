---
'@embedpdf/engine-services': minor
---

`FormExporter` and `FormImporter`: the form bundle's export, and its design and values imports as change ops (`forms.import`, `forms.importValues`), each recording its undo. A design import's undo deletes each field it made, with its widgets and calculation-order slot; a values import's puts back each value and its filler. A restoring import's undo and redo take `doc.forms.import`. Worker kinds `forms.export`, `forms.import` and `forms.importValues` replace the FDF/XFDF ones; `sniffFormat`, `FormReader.exportData` and `FormMutator.importData` are gone. `doc.apply` refuses a form import op.

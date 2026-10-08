---
'@embedpdf/engine-core': minor
---

A field's scripts can be written: `create()` and `update()` take `actions` (`FieldActionsPatch`: `keystroke`, `format`, `validate`, `calculate`, each a `FieldScriptWrite` or `null` to remove it; an event left out keeps its script). A field event takes JavaScript only. Writing a script takes `doc.forms.script` too (`writesScripts()`); removing one does not.

The calculation order follows the calculate scripts: a script puts the field at the end, removing it or deleting the field takes the field out. New `doc.forms.reorderCalculations(fields, position)` (`FieldPosition`), its change op `forms.reorderCalculations` and event `forms.calculationsReordered`, answering the whole order. Results of `create`, `update` and `delete` carry `calculationOrder` when they changed it. Undo puts scripts and the order back.

New write shapes for actions: `PdfActionWrite` (JavaScript, go-to, URI, named, hide, reset-form, submit-form, with `next`), `actionWriteOf()` (a read tree as a write), `fieldScriptOf()`, `isFieldScript()`, `needsScriptRight()`. New suite `runFormScriptConformance`; the change round trips cover scripts and the order.

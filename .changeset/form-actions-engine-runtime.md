---
'@embedpdf/engine-runtime': minor
---

Form actions and push buttons can be written:
- **Action creators:** `EPDFAction_CreateJavaScript`, `EPDFAction_CreateHide`, `EPDFAction_CreateResetForm` and `EPDFAction_CreateSubmitForm` make indirect action dictionaries, naming fields by name or object number (`EPDF_ACTION_TARGET`). `EPDFAction_SetNext` chains actions.
- **Event setters:** `EPDFAnnot_SetEventAction` sets a widget's `/A` or `/AA` event; `EPDFForm_SetFieldEventAction` sets a field's keystroke, format, validate or calculate action. On a field merged with its widget each touches only its own plane's keys. A field's events inherited from a parent are copied in before its first own entry, so they keep applying.
- **Calculation order:** `EPDFForm_SetCalculationOrder` writes `/AcroForm /CO`.
- **Push buttons:** `EPDFForm_CreateField` creates push buttons, and attaching a widget draws one with its caption. `EPDFAnnot_Set/GetMKText` (`/MK /CA`, `/RC`, `/AC`) and `EPDFAnnot_Set/GetMKTextPosition` (`/TP`) write and read captions. `EPDFAnnot_GenerateFormFieldAP` draws push buttons.
- **Rotation:** `EPDFAnnot_Set/GetMKRotation` write and read `/MK /R`.

Splitting a field merged with its widget (`EPDFForm_AttachWidget`) now moves the widget's `/A` and its `/AA` events to the new widget; before, they stayed on the field and the widget lost them. The new widget also takes the merged dictionary's place in the page's `/Annots`; before, it went to the end, the top of the stacking order.

---
'@embedpdf/engine-runtime': minor
---

Form values are written as told:

- New: `EPDFForm_SetFieldValue`, `EPDFForm_SetFieldDefaultValue`, `EPDFForm_SetFieldSelectedIndices`, `EPDFForm_SetFieldWidgetsChecked` and `EPDFForm_RedrawFieldWidgets`. They decide nothing (no cut to `/MaxLen`, no sibling widgets, no option order) and write nothing a field already holds.
- Removed: `EPDFForm_SetToggle`, `EPDFForm_SetTextValue`, `EPDFForm_SetChoiceValues`, `EPDFForm_ResetField`, `EPDFForm_SetFieldDefaultValues`, `EPDFForm_SetFieldDefaultToggle`, `EPDFForm_RemoveFieldDefaultValue`, `EPDFForm_ImportFDF` and `EPDFForm_ImportXFDF`. `EPDFForm_SetFieldOptions` writes `/Opt` only.
- New readers: `EPDF_GetPageTabOrderByIndex` (`/Tabs`), `EPDFForm_GetFieldTopIndex` (a list box's `/TI`), `EPDFAnnot_GetDefaultAppearanceFontFace` (the `/DA` font as family, weight and italic).
- `EPDFAnnot_Get/SetTextAlignment` take widgets; a text field draws its border style; rewriting `/DA` with `FPDF_FONT_UNKNOWN` keeps the font a field's or the form's `/DA` names.

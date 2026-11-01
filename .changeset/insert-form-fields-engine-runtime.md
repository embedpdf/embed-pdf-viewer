---
'@embedpdf/engine-runtime': minor
---

New `EPDFDoc_ImportPages` copies pages with the form fields of their widgets, where `FPDF_ImportPagesByIndex` left each copied widget's `/Parent` naming an object of the source and wrote no `/AcroForm`. Each field above the copied widgets is copied once, its `/Kids` limited to what was copied, and the copied top-level fields join the destination's `/AcroForm /Fields` (made when it has none) with the source's `/DR` resources, `/DA` and `/Q`, `/NeedAppearances`, calculation order and `SignaturesExist`. A `/DR` font is shared only when the destination defines one of that name the same way, key for key (widths and descriptor included, no font program); otherwise it is copied under a free name, and the copied `/DA` strings follow, comments and all. A copied pop-up's `/Parent` names the copy of its annotation.

New `EPDFDoc_GetImportFieldRoots` lists the top-level fields an import of some pages brings, and `EPDFForm_GetFieldPartialName` reads a field's own `/T` by object number.

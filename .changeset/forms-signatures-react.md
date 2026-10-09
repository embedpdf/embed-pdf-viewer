---
'@embedpdf/react': minor
---

`/form`: `<FormLayer>` is the one way to fill forms, with or without the annotation plugin: it puts real controls over the fields' own pictures (the page raster, or the `<AnnotationLayer>` while the form plugin keeps widgets inert), and draws its focus ring, the edge of a field without a border and the editor in the form settings' colors, through the `--epdf-form-*` CSS variables. `formWidgetRenderer` and the `FormHostToken` export are gone, and so is `<AnnotationLayer renderers={[formWidgetRenderer]}>`. `useForm()` is the public capability; `useFormState()` (`fields`, `status`, `formKind`, `selectedField`) and `useFormSettings()` replace `useFormSnapshot()` and `useFormField()`; `useFormValue(ref)` reads empty without a document. `toFieldRef` comes from `/form`.

`/signature`: `useSignatureState()` (`signatures` with their verdicts, `protection`, `target`, `busy`, `pending`, `status`) and `useSignatureSettings()` replace `useSignatureSnapshot()`, `useSignatureVerdicts()`, `useDocumentProtection()` and `useSignatureTarget()`.

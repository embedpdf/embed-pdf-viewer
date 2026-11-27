---
'@embedpdf/react': minor
---

`<FormLayer>` shows what an empty field is for: the label of its purpose, in the `fields.placeholder` color, in a text box, a dropdown and a signature field, and on the field in design mode. A text box whose purpose is one of the web's names for a value (`name`, `email`, `organization`, `organization-title`) carries it as `autocomplete`. A field without a purpose is drawn as before. `@embedpdf/react/form` also exports `formatDate()` and `parseDate()` for a date picker of your own.

<FormLayer> paints only the fields the user fills in: a box that isn't theirs (another person's field, a read-only one) gets no edge and no placeholder, and looks as the PDF has it. The day of signing gives the person whose date it is its hint as the box's tooltip and the control's `aria-description`. In design mode <AnnotationLayer> draws a lent field's outline, and a field tool's ghost carries the field's tint, outline and placeholder, see-through.

<FormLayer> paints a field anyone fills in in its own tint (`fields.anyoneTintColor`) and reads "Anyone" after its name; a box the `fillable` setting leaves out gets no tint. The form's state has `designAssignment`, who the next fields placed with a tool are for.

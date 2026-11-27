---
'@embedpdf/web': minor
---

Add what the form layers share to show an empty field's purpose: `fieldPlaceholderStyleOf()` and `recordPlaceholderStyleOf()` for the placeholder's style, in the new `--epdf-form-field-placeholder` color, and `autocompleteOf()`, which gives a text box its `autocomplete` from the field's purpose (`name`, `email`, `organization`, `organization-title`).

A field in no group can show the form's `fields.tintColor`, which the new `--epdf-form-field-tint-color` wins over (`fieldTintOf()` reads an accent's `base`). `widgetBoxStyleOf()` takes a box's `yours`: a box that isn't the user's gets no edge, as the PDF has it. New: `recordOutlineStyleOf()` for a lent field's outline in `fields.border`, and `ariaDescriptionOf()` for a field's hint.

A field anyone fills in shows the form's `fields.anyoneTintColor`, which the new `--epdf-form-field-anyone-tint-color` wins over (`fieldTintOf()` reads an accent's `anyone`).

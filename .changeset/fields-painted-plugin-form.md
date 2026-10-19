---
'@embedpdf/plugin-form': minor
---

Rights per field, and what the form layer paints:

- **`canFill(field)`** takes the field: `doc.forms.fill`, or a `fields:fill` permission for its group. Filling in a field the user may not fill in is refused naming the permission (`fields:fill:group=seller`); `setValues` fails just that entry, and `importValues` skips it.
- **The fill controls** of a field the user may not fill in (a signature field: sign) are disabled, so Tab skips them.
- **`validate()`** checks the required fields the user may fill in, and **`reset()`** without fields puts back those fields only. A field you name that the user may not fill in refuses the reset.
- **Hidden widgets** (`hidden`, `noView`) get no control.
- **For the form layer:** `listShownWidgets(page)`, the widgets a page shows with the state each one shows.
- The tools' placement helpers come from `@embedpdf/core-annotation`.

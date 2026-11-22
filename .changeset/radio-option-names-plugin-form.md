---
'@embedpdf/plugin-form': minor
---

Name each radio button by its own option. `listWidgets(page)` gave every button of a radio group the same `label`, the group's tooltip, so a screen reader announced all of a group's buttons alike. A radio button's `label` now adds the option it stands for, its export value, the way screen readers read a radio button in Acrobat: `Plan: monthly`. A radio item also carries `inGroup`, `{ position, size }`: where the button comes among its group's buttons, in the order the arrow keys go round, for `aria-posinset` and `aria-setsize`. Checkboxes keep the field's label.

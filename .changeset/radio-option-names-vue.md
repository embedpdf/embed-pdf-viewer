---
'@embedpdf/vue': patch
---

Announce each radio button of `<FormLayer>` by its own option. Every button of a group was announced by the group's name alone ("Plan, radio button"), so a screen reader user couldn't tell them apart. Each button now has its option in its name ("Plan: monthly") and says where it comes in its group ("1 of 2") with `aria-posinset` and `aria-setsize`, since a group's buttons stand apart on the page with no group element around them.

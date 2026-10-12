---
'@embedpdf/web': minor
---

`focusablesIn` and `tabbablesIn` see through a `<slot>`: the elements a web component's slot shows (its slotted children) count in their place, and the slot's own fallback content doesn't while something is slotted. So a toolbar's arrow keys reach a slotted item's first control, and a focus trap keeps slotted controls in its Tab order.

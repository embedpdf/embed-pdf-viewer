---
'@embedpdf/engine-services': minor
---

The worker applies the new op `forms.copy`. It reads the form, plans the copies before the first write, and creates each new field as a design import creates one: with its widgets, their flags, its value when asked, and its place in the calculation order. Its reverse deletes the fields it made, the last first. It needs `doc.forms.modify`; a script, a submit or a link is left out and reported without `doc.forms.script`. A copy names at most as many fields as the bundle limits' `items`; more is refused with `PayloadTooLarge` before the form is read.

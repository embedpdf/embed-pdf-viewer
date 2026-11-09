---
'@embedpdf/engine-services': minor
---

`annotations.update` and `forms.updateWidget` write a new `nm` to the annotation's own `/NM`, or remove it for `null`. The object, its replies, its appearance and its other keys stay as they are. A name another annotation on the page has is refused with `InvalidArg`. An empty name removes `/NM`, as a create given one writes none.

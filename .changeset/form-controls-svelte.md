---
'@embedpdf/svelte': minor
---

Draw a form field with your own component, and attach UI to a field.

- `<FormLayer {controls}>` takes a list of `FieldControl`, `{ for, component }`: the first one whose `for` matches a box draws it, and a box none matches is drawn as before. The component gets `widget` (the box, as `listWidgets()` gives it), `frame` (the box to draw into: the layer places, turns and scales it like the field), `native` (the layer's own control with the field's picture, to keep and add to, drawn with `{@render native()}`), `setValue` (fills the field in, as typing does) and `focused`. Tab, `focus()` and `focusNext()` put the cursor in the first element inside your control that takes focus, and a click runs the field's own action after the value you wrote. Without `controls` the layer draws what it drew.
- `useFormWidgetAnchor(widget)` gives the anchor of one box of a field for `<Anchored>`, as `{ current }`, and follows the box while the field is moved in design mode: a tag pinned to a field, or a card next to it. `widget` may be a function. `null` for `null`, or a box that isn't there.

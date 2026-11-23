---
'@embedpdf/angular': minor
---

Draw a form field with your own template, and attach UI to a field.

- `<epdf-form-layer>` takes controls as templates: `<ng-template [epdfFieldControl]="match" let-widget>` draws the boxes `match` says yes to, the first template that matches wins, and a box none matches is drawn as before. The template gets `widget` (the box, as `listWidgets()` gives it), `frame` (the box to draw into: the layer places, turns and scales it like the field), `native` (the layer's own control with the field's picture, to keep and add to, drawn with `[ngTemplateOutlet]="native"`), `setValue` (fills the field in, as typing does) and `focused`. Tab, `focus()` and `focusNext()` put the cursor in the first element inside your control that takes focus, and a click runs the field's own action after the value you wrote. Without a control template the layer draws what it drew.
- `EpdfForm.widgetAnchorOf(widget)` gives the anchor of one box of a field for `<epdf-anchored>`, as a signal, and follows the box while the field is moved in design mode: a tag pinned to a field, or a card next to it. `widget` may be a function. `null` for `null`, or a box that isn't there.

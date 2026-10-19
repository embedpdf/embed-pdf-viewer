---
'@embedpdf/plugin-form': minor
---

- Filling in shows at once: a typed value, a click, a reset, a batch of values and what a script writes show before the engine answers, and stay unless the engine refuses them. Fields stay editable while a write is on its way: a widget is `disabled` only when its field is read-only or isn't yours to fill.
- Every fill is one change with the calculations it causes: one request and one undo step. `setValues` and `importValues` write all their values as one change with one recalculation, without keystroke or validate scripts, as a script's `field.value` does.
- The form's scripts read the form as you see it, so a commit reads nothing from the engine. A script's or an action's writes (JavaScript, hide and reset actions) go with the calculations they cause.
- A fill the engine refuses leaves the form, and the calculations run again against what is left. An undo pressed while a fill's scripts still run takes the value back, and nothing worked out for it lands.
- Undoing a fill shows the fields and their widgets as they were, at once.
- A submit sends the form as you see it, once every fill on its way is answered.
- The scripts' engine starts when the first field of a form with scripts takes focus, and never for a form without field scripts. A form with scripts but no script realm logs a one-time hint.
- A field you name with `toFieldRef(name)` runs its own scripts.
- `getValue()` returns the same object while the field's value stays the same.
- `createFormScriptingController({ document, transaction, budget })` reads the form you give it and returns what the scripts changed (`FormScriptResult`) instead of writing it: `transaction(body)` runs the scripts and your write in one realm transaction, `commit`, `activate` and `recalculate` take the form, and `warm(form)` starts the realm.

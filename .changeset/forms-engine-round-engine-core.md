---
'@embedpdf/engine-core': minor
---

The form rules, for a viewer to show a form write before the engine answers:

- `fieldAfterValue`, `fieldAfterReset`, `widgetsAfterDisplay`, `formFieldOfDraft`, `formFieldAfter` and `widgetAfterPatch` give the field or widget a write leaves, by the rules the engines write by (a text value cut to its maximum length, check boxes and radio buttons in unison, list options in option order, a reset to the default). `runFormPredictionConformance` checks them against each engine.
- `doc.security.fieldRights()` lists the groups the handle may fill in, sign and assign (`fieldRightsOf` for a scope).
- Widgets: `borderStyle` can be `'underline'`, `dashArray` is the dash of a dashed border, and check boxes and radio buttons have a `checkStyle` (`null` is the family's own mark).
- A form write's `meta.redrawnWidgets` lists the widgets whose pictures it changed.
- `doc.forms.applyEffects` is removed, with its `forms.effectsApplied` event: a script run's effects are one change, `doc.apply({ ops: formEffectOps(effects) })`. A `forms.setDisplay` op takes no `expect`.

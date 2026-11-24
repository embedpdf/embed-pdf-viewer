---
'@embedpdf/plugin-form': minor
---

Say more about each field box, and attach UI to one.

- Each entry of `listWidgets()` gains `ref` (the box's own address, what `getWidget()` takes, beside `annotationRef`), `groupId` (the field's group, or `null`), `canFill` (whether the session may fill it in, or sign it for a signature field: its permissions alone, where `disabled` also counts read-only fields and the `fillable` setting), `required`, and `empty` (it holds nothing yet, by the rule `validate()` checks a required field with). The values it had are unchanged.
- The host lens gains `getWidgetAnchor(widget)`, the page and box that UI attaches to for one box of a field, following the box while it is moved in design mode, and `isWidgetFocused(widget)`. The framework packages build `useFormWidgetAnchor()` and a control's `focused` on them. `FormWidgetAnchor` is the anchor's type.
- The plugin lists the Stage among the plugins it may use. `focus()`, `focusNext()` and Tab between fields threw in a development build ("resolved capability stage without declaring it"), because the cursor asks the Stage to bring a field into view.

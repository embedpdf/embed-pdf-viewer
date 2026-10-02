---
'@embedpdf/web': patch
---

Add the annotation, form and signature parts every framework adapter wrote for itself, so they share one implementation:

- Text boxes: `createTextBoxEditorFollower()` keeps an element the editor of a text box while the element, the plugin, the box and the scale change; `textBoxEditorScaleOf(item, page, lookScale)` is the pixels per point of an editor element a renderer draws itself; `editingTextKeyOf(texts, keyOf)` names the text box being typed in; `layerTextBoxesOf(texts, items, renderers, keyOf)` leaves out the text boxes a look of yours edits.
- `bakedAppearanceOf(urls, key)`: an annotation's loaded picture as a renderer's `appearance`.
- `installFilePickerProvider(annotation, provider, onRepeat)`: one file picker per document, and a call when a second install replaces the first.
- The form layer's styles as style records: `widgetBoxStyleOf`, `textFieldEditorStyleOf`, `listBoxControlStyleOf`, `formFocusRingStyleOf` and `FORM_CONTROL_FILL`; and `showSelectedOptions(select, values)`, a selection shown on a native `<select>`'s options.
- `cssText(style)`: a style record as CSS text, for a framework whose `style` is a string.

`CssFont`, `FieldTextStyle`, `TextFieldStyle` and `ListBoxStyle` are type aliases now, so they fit a style type with an index signature for custom properties (Vue's `CSSProperties`).

---
'@embedpdf/plugin-form': minor
---

Each widget has a picture version in the form's mirror, moved when the engine draws the widget again (a checkbox that only switches its state isn't drawn again, so nothing is fetched). New host calls, the same shape as the annotation plugin's: `getAppearanceEpoch(page)` and `renderAppearances(page, scale, signal)`. A shown widget says whether its look is `pending` and its `pictureVersion`; `getWidgetPainting(widget)` is the painter's drawing of it as the view has it, with the text this session's format scripts wrote (each run of text carries the face it draws in); in design mode the annotation plugin draws a widget with the same painter while its look is pending or its picture is older; `getTextEditorLayout(widget, text)` is where a text field's editor shows the text being typed.

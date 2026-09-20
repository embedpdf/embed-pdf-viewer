---
'@embedpdf/plugin-form': patch
'@embedpdf/plugin-annotation': patch
---

Use the widget's engine-computed annotation address (`widget.ref`) instead of composing one by hand: the form place handler selects it, detach passes it, and the annotation plane keys widget appearance bumps by it.

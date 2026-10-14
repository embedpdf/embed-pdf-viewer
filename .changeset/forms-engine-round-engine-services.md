---
'@embedpdf/engine-services': minor
---

- Widgets read and write an underline border, a dashed border's dash, and a check box's or radio button's check style.
- Form writes report the widgets whose pictures changed (`redrawnWidgets`).
- `forms.setDisplay` and `forms.setAppearanceText` are change ops; the form-effects batch and its `forms.applyEffects` job are removed.
- A reset of fields already at their defaults, or a display that changes no widget, writes nothing: it can't be undone.

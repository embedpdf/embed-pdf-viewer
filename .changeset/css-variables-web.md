---
'@embedpdf/web': minor
---

Add `EPDF_VARIABLES`, the list of every `--epdf-*` CSS variable that themes EmbedPDF: the setting each one overrides, the part its default follows (another part, or an accent), and its built-in value. `paint(name, settingValue)` gives the CSS value a painted part uses, so any variable wins over its setting: the part's own variable, then the variable of the part it follows, its plugin's accent variable such as `--epdf-annotation-accent`, and `--epdf-accent`, then the setting's value. The rotation handle follows the other handles, so `--epdf-annotation-handle-fill` and `--epdf-annotation-handle-stroke` reach it too. A dash style paints as a dash array (`'dashed'` is `4 3`). `mixAccent()` builds a translucent default such as "the accent at 35%" with `color-mix()`, so it follows the accent variables too, and `paintDefault()` gives the CSS value of a part you style yourself, which has no setting.

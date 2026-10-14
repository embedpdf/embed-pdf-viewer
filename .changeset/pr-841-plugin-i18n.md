---
'@embedpdf/plugin-i18n': minor
---

Add `getTranslator()` for render code that needs a stable translation function
until the active locale or translations change. Keep locale registration and
lazy loading reactive under the updated plugin state model.

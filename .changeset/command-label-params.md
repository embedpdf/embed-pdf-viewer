---
'@embedpdf/plugin-commands': minor
---

A command can have `labelParams(context)`: the values for its label's `{name}` slots, such as how many pages are selected. It's asked like `enabled`, again whenever the viewer's state or your app's changes. The values go into `label`, into the translated words under `labelKey` or the command's id, where a number `count` picks the plural form, and into every sentence that names the label. A `labelParams` that throws gives no values. Without the i18n plugin, `label`'s slots are filled too.

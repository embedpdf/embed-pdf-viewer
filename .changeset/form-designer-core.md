---
'@embedpdf/core': patch
---

While a document's plugins are built, the store holds its notifications, and listeners hear of the whole bring-up once every plugin is there. A plugin's `create()` that wrote state used to wake listeners at once, and one reading a plugin not built yet had it built out of order, before the plugins it looks for as it's created: the form plugin then found no annotation plugin, and design mode never lent its widgets.

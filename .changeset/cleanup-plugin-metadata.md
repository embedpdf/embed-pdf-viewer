---
'@embedpdf/plugin-metadata': minor
---

Metadata is a mirror of the document: it loads once the plugin connects, follows `metadata.updated` from every session, and reloads after a desynced stream. `onResynced` announces loads; `refresh()` takes no options.

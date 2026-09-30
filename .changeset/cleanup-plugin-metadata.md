---
'@embedpdf/plugin-metadata': minor
---

Metadata is a mirror of the document: it loads once the plugin connects, follows `metadata.updated` from every session, and reloads after a desynced stream. `onResynced` announces loads; `refresh()` takes no options.

Custom metadata keys are exposed through their own document operations and stay in sync with the mirrored metadata snapshot.

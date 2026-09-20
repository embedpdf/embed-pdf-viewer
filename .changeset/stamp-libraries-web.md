---
'@embedpdf/web': minor
---

`indexedDbByteStore(dbName, { storeName? })` is the browser's bytes-by-id store: one IndexedDB object store with `list`, `put`, and `delete`. It is the adapter for any plugin's DOM-free persistence port (structurally `StampLibraryStore` from `@embedpdf/plugin-stamp`), written once here so every framework binding shares it.

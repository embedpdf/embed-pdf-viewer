---
'@cloudpdf/contract': minor
---

Add folders: `folders.create`, `folders.list`, `folders.get` (with the path
above the folder), `folders.update` to rename, `folders.moveInto` to move
documents and folders together, and `folders.delete` for empty folders. The
top level is the place `root`. Document records carry `folderId`;
`documents.init` and `documents.importFrom` take one, and `documents.list`
filters by it. Folder conflicts answer 409 with `details.reason`.

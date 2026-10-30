---
'@cloudpdf/contract': minor
---

`tokens.issue` makes upload tokens: `{ kind: 'upload', sub, folderId?, metadata?, maxFiles?, maxBytes?, origins?, expiresIn }`. A key needs `docs.create` to make one. `documents.init`, `documents.commit` and `documents.uploadProxy` accept them as a new `upload-jwt` credential (OpenAPI scheme `uploadToken`).

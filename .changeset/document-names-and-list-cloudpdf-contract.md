---
'@cloudpdf/contract': minor
---

Documents have a `name`: set it with `documents.init` or `documents.import`
(it defaults to the document id) and change it with the new `documents.update`
operation, which needs the new `docs.update` tenant scope. `documents.list`
gains `q` to search names ignoring case, `sort` (`createdAt`, `name` or
`size`) and `order`, and no longer lists documents that are being deleted
unless `state=deleting` asks for them.

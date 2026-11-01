---
'@cloudpdf/server': minor
---

Tenant scopes act on records and document capabilities act on what is inside
documents, on any token. A tenant JWT is checked inside documents the way a
document JWT is, against the document capabilities its scope names, which hold
for every document of the tenant; `docs.read` lists documents but no longer
opens, reads or changes them. Downloading the original file needs
`doc.download` and the thumbnail needs `doc.render`. A tenant token whose scope
names no document capability is refused on the document routes, and
`tokens.issue` validates a tenant token's scope entries.

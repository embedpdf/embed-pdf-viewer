---
'@cloudpdf/contract': minor
'@cloudpdf/server': patch
---

Rename `documents.import` to `documents.importFrom`. `import` is a reserved
word in Java and Python, so those generators escaped the method to `import_`,
silently forking the documented SDK surface per language. The new name reads
as a sentence with the request's required `source` field
(`client.documents.importFrom({ source })`, `import_from(source=…)`) and is
identical across all seven SDKs. The wire path is unchanged
(`POST /v1/tenants/{tenantId}/documents/import`), so deployed servers and
recorded requests are unaffected; only the SDK method and derived wire type
names (`DocumentsImportFrom*`) change. The OpenAPI emitter now rejects any
group or method segment that is a reserved word in Java, Python, or Ruby at
emit time — the other four targets are structurally safe — making this
collision class an API-design error instead of a generator surprise.

---
'@cloudpdf/engine': minor
---

`baseUrl` is optional: an engine that names no server connects to CloudPDF SaaS, `https://engine.cloudpdf.com` (exported as `CLOUDPDF_SAAS_URL`). `cloudEngine()` takes no options at all for the SaaS; your own `@cloudpdf/server` still names itself, `cloudEngine({ baseUrl })`.

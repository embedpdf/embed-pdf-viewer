---
'@cloudpdf/engine': minor
---

Use the document-scoped access endpoint for unlock requests. Add an
opt-in `docAffinityHeader` option for routing document requests and
bounded retries for server `EngineBusy` and `EngineRestarting`
responses, including `Retry-After` handling and an `onRetry` callback.

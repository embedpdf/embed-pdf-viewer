---
'@cloudpdf/engine': minor
---

Unlock requests use the layer-tier access endpoint
(`POST /v1/docs/:docId/layers/:layerName/access`) — identity rides the
path like every layer route. The `X-CloudPDF-Doc` affinity header is now
sent BY DEFAULT on origin-bound document requests (routing hints are
client behavior; whether a load balancer uses them is the operator's
choice) — `docAffinityHeader: false` remains as an escape hatch for
servers whose CORS allowlist predates the header or proxies that reject
unknown headers. Bounded transport retries for server `EngineBusy` and
`EngineRestarting` responses, including `Retry-After` handling and an
`onRetry` callback.

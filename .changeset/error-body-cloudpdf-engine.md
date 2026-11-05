---
'@cloudpdf/engine': minor
---

Every server error reads as an `EngineError` with the server's code: `GrantExpired`, `OriginNotAllowed`, `OriginRequired`, `EngineBusy` and the rest of the codes the server sends are the error's code, not `Forbidden` or `Unknown`. A code this client doesn't know falls back to the HTTP status.

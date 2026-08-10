---
'@cloudpdf/engine': minor
---

Adds share-session support, the client half of the no-backend embed flow.

- Adds `exchangeShareToken`, which trades a public share token for a short-lived document session, and `ShareExchangeError`, whose `code` names the outcome (`SharePasswordRequired`, `OriginNotAllowed`, `ShareExpired`, `NotFound`).
- Adds `shareSessionSource`, a caching token source that re-exchanges shortly before expiry and shares one in-flight exchange between concurrent callers. Because the transport resolves its token source on every request and on stream reconnect, renewal needs no timers and no listeners.
- Requires no change to `open()`: an exchanged session is an ordinary document-scoped JWT, so a share source feeds `open({ kind: 'token' })` unchanged, and each open keeps its own credential.

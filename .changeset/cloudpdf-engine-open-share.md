---
'@cloudpdf/engine': minor
---

`open({ kind: 'share' })`: the engine resolves public share tokens itself.

- The share arm exchanges `shr_…` for a session JWT on the engine's own transport (`baseUrl` + configured `fetch`) and delegates to the `token` arm, so the handle binds to a self-renewing source — revoking or editing the share retargets the open at the next renewal. Works on an engine constructed with no engine-level token at all.
- Exchange failures surface as `EngineError`s — on `open()` and on every later renewal (RPCs, SSE reconnects) — never as raw `ShareExchangeError`s. Protected grants reject with the new `EngineErrorCode.SharePasswordRequired`; the wire code and HTTP status ride in `details`, the original error in `cause`. The mapping is exported as `engineErrorFromShareExchange`.
- `shareSessionSource` now declares its concrete return type (`() => Promise<string>`) instead of the `TokenSource` union; `HttpClient` exposes `baseUrl` and `fetchImpl` getters.

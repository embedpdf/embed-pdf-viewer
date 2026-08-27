# @cloudpdf/engine

## 3.0.0-next.9

### Minor Changes

- [#772](https://github.com/embedpdf/embed-pdf-viewer/pull/772) by [@bobsingor](https://github.com/bobsingor) – Implement page insertion, blank-page creation, and page extraction in the
  cloud document pages service. Insertions invalidate stale manifest rows and
  publish local or realtime `pages.inserted` events with the updated layout.

## 3.0.0-next.8

### Minor Changes

- [#783](https://github.com/embedpdf/embed-pdf-viewer/pull/783) by [@bobsingor](https://github.com/bobsingor) – Use the document-scoped access endpoint for unlock requests. Add an
  opt-in `docAffinityHeader` option for routing document requests and
  bounded retries for server `EngineBusy` and `EngineRestarting`
  responses, including `Retry-After` handling and an `onRetry` callback.

## 3.0.0-next.7

## 3.0.0-next.6

## 3.0.0-next.5

### Minor Changes

- [#759](https://github.com/embedpdf/embed-pdf-viewer/pull/759) by [@bobsingor](https://github.com/bobsingor) – Support full-fidelity page text snapshots and character-space search ranges through the cloud engine transport. Remote text extraction now preserves the same character-to-text mapping and search-to-selection semantics as the local engine.

## 3.0.0-next.4

### Minor Changes

- [#749](https://github.com/embedpdf/embed-pdf-viewer/pull/749) by [@bobsingor](https://github.com/bobsingor) – `open({ kind: 'share' })`: the engine resolves public share tokens itself.
  - The share arm exchanges `shr_…` for a session JWT on the engine's own transport (`baseUrl` + configured `fetch`) and delegates to the `token` arm, so the handle binds to a self-renewing source — revoking or editing the share retargets the open at the next renewal. Works on an engine constructed with no engine-level token at all.
  - Exchange failures surface as `EngineError`s — on `open()` and on every later renewal (RPCs, SSE reconnects) — never as raw `ShareExchangeError`s. Protected grants reject with the new `EngineErrorCode.SharePasswordRequired`; the wire code and HTTP status ride in `details`, the original error in `cause`. The mapping is exported as `engineErrorFromShareExchange`.
  - `shareSessionSource` now declares its concrete return type (`() => Promise<string>`) instead of the `TokenSource` union; `HttpClient` exposes `baseUrl` and `fetchImpl` getters.

## 3.0.0-next.3

## 3.0.0-next.2

### Minor Changes

- [#730](https://github.com/embedpdf/embed-pdf-viewer/pull/730) by [@bobsingor](https://github.com/bobsingor) – Adds share-session support, the client half of the no-backend embed flow.
  - Adds `exchangeShareToken`, which trades a public share token for a short-lived document session, and `ShareExchangeError`, whose `code` names the outcome (`SharePasswordRequired`, `OriginNotAllowed`, `ShareExpired`, `NotFound`).
  - Adds `shareSessionSource`, a caching token source that re-exchanges shortly before expiry and shares one in-flight exchange between concurrent callers. Because the transport resolves its token source on every request and on stream reconnect, renewal needs no timers and no listeners.
  - Requires no change to `open()`: an exchanged session is an ordinary document-scoped JWT, so a share source feeds `open({ kind: 'token' })` unchanged, and each open keeps its own credential.

## 3.0.0-next.1

## 3.0.0-next.0

### Major Changes

- [#711](https://github.com/embedpdf/embed-pdf-viewer/pull/711) by [@bobsingor](https://github.com/bobsingor) – Introduces the CloudPDF implementation of the Engine v3 interface. It gives browser applications the same document API as the local engine while executing PDF operations remotely through CloudPDF over HTTPS.

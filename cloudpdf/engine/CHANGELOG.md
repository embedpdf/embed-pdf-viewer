# @cloudpdf/engine

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

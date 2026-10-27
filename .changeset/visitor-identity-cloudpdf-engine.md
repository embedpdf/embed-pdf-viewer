---
'@cloudpdf/engine': minor
---

Share links that ask who the visitor is. `open({ kind: 'share', shareToken, visitor })` sends the answers; without the required ones, a link that asks on open fails the open with `VisitorIdentityRequired`, whose `details` are the questions. A link that asks before the first change opens at once: its changes wait in the document's write line while something listens (`doc.share.onIdentityRequest`), and go out as they were once `doc.share.identify(answers)` succeeds; `doc.share.decline()` fails them, and with nothing listening they fail at once. A change the server refuses for the answers waits the same way and is sent again with the same `opId`. A passphrase or answer the exchange refuses keeps its details on the `EngineError`.

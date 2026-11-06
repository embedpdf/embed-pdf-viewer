---
'@embedpdf/engine-core': minor
---

An event's `origin` spells out its fields: `subject` (was `sub`), `at` as an ISO 8601 string (was `ts`, milliseconds), `serverSequence` (was `serverId`) and `transaction` (was `tx`); `stream.desynced` carries `at`, and the event stream's `lastServerSequence()` replaces `lastServerId()`. A grant's callbacks are `onIdentityRequested` and `onOpenRequested`, and `resume()` takes `visitorIdentity`. Render results and appearance pictures say `mimeType`, as attachments and stamps do (was `contentType`).

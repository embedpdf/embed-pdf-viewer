---
'@embedpdf/core': minor
---

A refused call names what was missing. `PluginError` has `permission`: on `permission-denied`, the permission the session lacks, as the engine names it (`'doc.forms.fill'`, `'annotations:update'`), and null otherwise. `toPluginError` fills it from the engine's refusal, whether it arrives as a `PermissionDenied` or, from a worker or the server, as an `EngineError` with `details.required`; when any of several permissions would have done, it is the first, and `details` keeps the rest. `PluginErrorInfo` carries it too. Plugins check with two context helpers: `ctx.allows(permission)`, the same answer the engine enforces with, and `ctx.assertAllowed(permission, operation)`, which throws `permission-denied` ("`operation` requires `permission`") with `permission` set. A `Permission` is a document capability or `'annotations:create'`. Both read the bound document, so in a workspace plugin, which has none, they throw as reading `ctx.doc` does.

Events carry the engine's origin as it is. `ChangeOrigin` and `originOf()` are gone: a plugin event's `origin` is the engine event's `EventOrigin`, now exported from `@embedpdf/core`, so `locality` is `kind` and `actorId` is `sub`, and `ts`, `serverId` and `tx` come along.

`ctx.pageOf(page)` resolves a page argument as verbs take it, a `PageRef` or a zero-based index, and throws `not-found` for a page the document doesn't have. `ctx.getPage(page)` takes the same argument for reads, and returns `null` for a page the document doesn't have, so a read made while a page is deleted doesn't throw. `ctx.cancellable(signal, task)` runs an engine call the caller can cancel: when the signal fires, the call is aborted and the promise rejects `operation-cancelled` at once. The serial queue takes `{ signal }` as its second argument and skips an operation whose signal fired while it waited; `createSerialQueue(capability)` takes the plugin id for that error. The test context from `@embedpdf/core/testing` has the same four helpers, and its default document may create annotations.

`ObjectNumberUnavailable` and `LayerFull` refusals map to `conflict`.

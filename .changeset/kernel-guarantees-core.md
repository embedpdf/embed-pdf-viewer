---
'@embedpdf/core': minor
---

Kernel guarantees for the v3 authoring pattern. `planPlugins` rejects duplicate plugin ids, duplicate capability providers, and workspace plugins that require document-scoped tokens, naming both sides. Contexts resolve only declared tokens in development. State slices are held by per-instance leases: closing a document revokes its lease synchronously, so a retained context can neither read nor write a reopened document (`DocumentMeta.instanceId`). `documents` gains `listPages`, `getPage`, `getPageAt`, `getPageIndex` and `getRevision`. New: `PluginError` with stable codes and `toPluginError`, `EventHook` subscriptions with `{ signal }`, and the `create()` controller hook on `definePlugin` whose `ControllerContext` provides a guarded `doc` handle, `events.source`, `geometry.forPage`, `listen`, `waitFor`, `serialQueue`, `latest`, `acquire`, `assertPageRef` and `getPage`.

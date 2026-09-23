---
'@embedpdf/core': minor
---

A plugin has one context and one way to hold each kind of state.

- `PluginDef` is `{ id, token?, scope?, requires?, optional?, state?, create }`; `create(ctx)` returns `{ api, connect? }`. The `initialState`, `reduce`, `capability`, `init` and `effects` fields are removed, and so are `Action`, `dispatch`, `getState`, `onAction`, `EffectContext` and the `CORE_*` action constants. `definePlugin<State, Capability>` takes two type parameters.
- `ControllerContext` is merged into `PluginContext`: `ctx.state` (`get`, `update(transition, ...args)`, `onChange`) replaces `getState`/`dispatch`, `ctx.notify()` wakes readers of a resource, `ctx.watch(select, handler)` reacts to state the plugin does not own, and `ctx.core()`/the raw `ctx.subscribe` are gone (read the registry through `DocumentsToken`).
- New `ctx.mirror(spec)` and `ctx.pageMirror(spec)` keep a local copy of engine data current from confirmed document events of every origin, with loads, replay past a cursor, resyncs on `stream.desynced` and `document.versioned`, statuses and `settled()`; `reload()` / `reload({ pages })` let a fold ask for a re-read. A failed load or page re-read reports `error` (the value is stale) until a full load succeeds.
- New `memo` and `memoByKey` for identity-stable reads, and `createHostToken` for a plugin's host lens.
- `resolvesAnyCapability: true` lets a plugin that runs host-supplied code (the commands plugin) resolve undeclared tokens without the development-mode dependency error.
- `ChangeOrigin` is `{ locality, sessionId, actorId }`; `trigger` is removed.
- `@embedpdf/core/testing`: `createTestContext` takes `state` (not `initialState`/`reduce`), accepts a real engine document as `doc`, provides a `DocumentsToken` registry for its one document, and `connect(instance)` starts mirrors like the kernel does.

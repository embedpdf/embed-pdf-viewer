# Architecture

How the client stack is put together: what a plugin is, where its state lives,
how engine data reaches the UI, and how a plugin's files are laid out. The
details live in [`state-and-sync.md`](./state-and-sync.md),
[`events.md`](./events.md) and [`plugins.md`](./plugins.md).

## A plugin in one paragraph

A plugin provides one capability per scope: one for the workspace, or one for
each open document. The kernel builds it by calling the plugin's
`create(ctx)`. The capability is the plugin's only public surface: synchronous
reads, verbs that do work, and events. Inside, a plugin holds up to four kinds
of state, each with one home and one way to change. It talks to the engine
only through `ctx.doc`, and to other plugins only through their capabilities.

## Layers

| Layer      | Packages                                                                                       | Responsibility                                                              |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Engine     | `@embedpdf/engine-core` (the contract), `@embedpdf/engine` (local), `@cloudpdf/engine` (cloud) | Reads and writes PDF documents; publishes one confirmed event per mutation. |
| Kernel     | `@embedpdf/core`                                                                               | Scopes, plugin lifetime, the store, capability resolution, mirrors.         |
| Pure cores | `@embedpdf/core-*`                                                                             | One domain's logic, testable without a kernel, engine or DOM.               |
| Plugins    | `@embedpdf/plugin-*`                                                                           | One capability each, built on the kernel.                                   |
| Adapters   | `@embedpdf/react`, `@embedpdf/angular`, `@embedpdf/web`                                        | Render capabilities in one framework; read only through capabilities.       |
| Viewer     | `@embedpdf/viewer`, `@embedpdf/viewer-*`                                                       | The finished viewer, built on the adapters.                                 |

Where each package lives and what it is called: [`packages.md`](./packages.md).

## Scopes and bring-up

A plugin declares `scope: 'workspace'` (the default: one instance for the
kernel) or `scope: 'document'` (one instance per open document).

- **Workspace plugins** are created by `createKernel`, in dependency order.
  Their `connect` runs in `kernel.start()`.
- **Document plugins** are created when a document opens. After the engine has
  opened the document and listed its pages, the kernel gives every document
  plugin a fresh state cell, then, in dependency order, runs each plugin's
  `create`, then its `connect`, then starts the first load of the mirrors that
  plugin created.

A document open is transactional. Everything above runs before the document is
published; if a `create` or `connect` throws, every teardown registered so far
runs, the document never becomes ready, and its tab shows `error`. Only after
bring-up does the document appear in `documents.list()` as `ready` and
`documents.onOpened` fire.

Closing a document removes its tab at once, revokes the write access of every
instance's state and mirror cells, aborts the instance lifetime (pending
`ctx.doc` calls reject with `instance-closed`), runs every registered teardown
in reverse order, and then fires `documents.onClosed`.

## Four kinds of state

| Kind     | What it is                                                                                  | Where it lives                                                              | How it changes                                                                             | Examples                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Mirror   | A local copy of data the engine owns                                                        | `ctx.mirror(spec)` or `ctx.pageMirror(spec)`: a store cell of its own       | Only by folding confirmed engine events (every origin) and by loads. Verbs never write it. | form fields, annotation records, metadata, signatures, links per page, text geometry per page |
| Overlay  | A local change the engine has not confirmed yet                                             | Session state, keyed so its confirmation can find it                        | Added by a verb or gesture; dropped when the confirmation arrives or the write fails       | an annotation created optimistically, awaiting the engine's record with the same `/NM`        |
| Session  | State the client owns that is not in the PDF                                                | `ctx.state`                                                                 | Only through named pure transitions in `model.ts`                                          | camera, open surfaces, active tool, selection, search session, in-flight flags                |
| Resource | Anything that is not plain data: handles, rasters, workers, registries of functions, caches | Closures in the controller, released through `ctx.cleanup` or `ctx.acquire` | However the owner likes; readers are woken with `ctx.notify()`                             | raster store, tile manager, command and tool registries, script sandboxes                     |

What the UI sees is mirror, overlay and session combined by pure, memoized
reads.

Rules:

- A mirror always holds what the engine confirmed. Nothing optimistic enters
  it.
- An overlay entry has a key that its confirmation carries (an annotation's
  `/NM`, a field key), and a way to be dropped when the write fails.
- State is plain data: no functions, class instances, handles, `Map`s or
  `Set`s in `ctx.state` or a mirror. Anything else is a resource.
- No state exists only to wake the UI. A counter bumped so that selectors
  re-run is a `ctx.notify()` call instead.

[`state-and-sync.md`](./state-and-sync.md) describes each kind's API.

## Data flow

```
 user gesture or API call
          │
          ▼
   capability verb ──(optional)──► overlay entry (session state)
          │
          ▼
   await ctx.doc.<service>.<mutation>(...)
          │                                   another session's mutation
          ▼                                              │
   engine confirms ─► document event (origin: local) ◄───┘ (origin: remote)
          │
          ▼
   mirror fold(value, event)  ── the same code for every origin
          │
          ├─► new mirror value (its store cell)
          ├─► overlay entries matching the confirmation are dropped
          └─► the plugin's fact events fire (origin = originOf(event))
          │
          ▼
   store change ─► adapters re-run selectors ─► pure memoized reads ─► UI
```

Both engines publish the event for a session's own mutation before the
mutation's promise settles (see `DocumentEvent` in
`packages/engine/core/src/events/DocumentEvent.ts`, checked by
`runDocumentEventsConformance`). So when a verb's `await` returns, the fold has
already run: a verb never needs `waitFor`, a revision check or a refetch to see
its own write.

## Events

A capability exposes three kinds of events:

| Kind         | Meaning                              | Fired from                                                                                                                | Origin                            |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Fact         | Something changed in the document    | Where the confirmed document event is applied: a mirror's `changed` callback, or the plugin's one listener for that event | `originOf(event)`                 |
| State change | A session value changed              | The plugin's `ctx.state.onChange` listener, comparing previous and next                                                   | none                              |
| Occurrence   | An operation ran, finished or failed | Where the operation reaches that point                                                                                    | a domain field when one is needed |

An event fires from exactly one place. Events report what happened; what
something is, is read through a getter. Details: [`events.md`](./events.md).

## Reads

- Reads are synchronous and pure: `get*`, `list*`, `is*`, `has*`, `can*`.
- A read returns the same object until its inputs change, so adapter
  selectors compare with `Object.is`. Build such reads with `memo` and
  `memoByKey` from `@embedpdf/core`, not with hand-written caches.
- Reads never start engine work. Loading starts with `ensureLoaded(page)`, or
  by the mirror itself.

## Reactions

Some plugins do not copy engine data but must respond to it: render
invalidates rasters, search re-runs its query, signature re-judges its
verdicts, actions clears its trigger cache. A reaction:

- subscribes with `ctx.listen(ctx.doc.events, …)` inside `connect`;
- ignores origin for what it does;
- only invalidates its own caches or re-runs its own operations. It never
  writes another plugin's data.

## Pure cores

A `core-*` package exists when a domain needs logic worth testing without a
kernel, engine or DOM: page geometry (`core-geometry`), the camera and scene
(`core-stage`), annotation gestures and hit-testing (`core-annotation`), the
toolbar solver (`core-ui`).

- Inputs in, decision out: plain functions, or `update(model, message)`
  returning `[model, effects]` as in `core-annotation`. No I/O, no clock, no
  randomness.
- The plugin's controller performs the effects. A core does not call the
  engine.
- Cores know nothing about mirrors, overlays or events. They receive the data
  they need as arguments.
- A plugin's own pure functions live in its `model.ts`, not in a second
  `core/` folder.

## Plugin anatomy

```
packages/plugin/<name>/src/
  <name>.plugin.ts   the manifest: definePlugin({ id, token, scope, requires, optional, state, create })
  token.ts           createCapabilityToken(...), called once per package
  contract.ts        the public lens: capability interface, public types, the token re-exported
  host-contract.ts   optional: the host lens, the same token widened with createHostToken
  internal.ts        optional: framework-only helpers (a visibility boundary, not a bundle boundary)
  index.ts           the plugin factory and `export * from './contract'`
  model.ts           state shape, initial state, pure transitions, pure projections and folds
  controller.ts      create(ctx): builds the capability and returns { api, connect? }
  connect.ts         optional: registrations with sibling plugins, called from connect
  # larger plugins split the controller into areas:
  services/          plugin-private helpers shared by the areas
  read/ write/ sync/ tools/   one area per file, composed with composeApi
packages/plugin/<name>/test/   mirrors src/
```

Rules:

- The manifest holds no logic. Everything that registers with a sibling
  lives in `connect.ts` and runs inside `connect`.
- `create` returns `{ api, connect? }`, and `controller.ts` is where it is
  built.
- Every registration's `Unsubscribe` goes to `ctx.cleanup`, even when both
  sides close together.
- Tests mirror `src/` under `test/`.

Each file's role, the manifest fields, contracts and lifetime helpers:
[`plugins.md`](./plugins.md).

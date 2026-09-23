# Plugins

How to write a plugin: its files, its manifest, its controller and
contracts, how it declares and reaches its dependencies, how it owns what it
acquires, and how it fails. Where a plugin fits in the system:
[`architecture.md`](./architecture.md). Its state and events:
[`state-and-sync.md`](./state-and-sync.md) and [`events.md`](./events.md). How
it answers "may this session do that?": [`permissions.md`](./permissions.md).

## Anatomy

Every plugin has the same layout, so any file can be found without searching:

```
packages/plugin/<name>/
  src/
    <name>.plugin.ts   the manifest
    token.ts           the capability token
    contract.ts        the public lens
    host-contract.ts   optional: the host lens
    internal.ts        optional: framework-only helpers
    index.ts           the implementation entry
    model.ts           state, transitions, projections, folds
    controller.ts      create(ctx) → { api, connect? }
    connect.ts         optional: wiring to sibling plugins
    services/          optional: plugin-private helpers shared by areas
    read/ write/ sync/ tools/   optional: one area per file
  test/                mirrors src/
```

| File               | Holds                                                                                            | Never holds                         |
| ------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `<name>.plugin.ts` | `definePlugin(...)` inside the plugin factory                                                    | logic, subscriptions, registrations |
| `token.ts`         | the one `createCapabilityToken` call                                                             | anything else                       |
| `contract.ts`      | the capability interface, its public types, the token re-exported                                | implementation                      |
| `host-contract.ts` | the wider interface for siblings and adapters, and the same token widened with `createHostToken` | implementation                      |
| `internal.ts`      | helpers the framework adapters need and applications must not use                                | public API                          |
| `index.ts`         | the plugin factory and `export * from './contract'`                                              | anything else                       |
| `model.ts`         | the state type, `initial<Name>State()`, pure transitions, pure projections, folds                | I/O, engine calls, the context      |
| `controller.ts`    | `create<Name>Controller(ctx, config)`: builds the capability                                     | sibling registrations               |
| `connect.ts`       | `connect<Name>(ctx, api)`: registrations with siblings                                           | verbs, reads                        |

## The manifest

```ts
// packages/plugin/metadata/src/metadata.plugin.ts
export const metadataPlugin = () =>
  definePlugin<void, MetadataCapability>({
    id: 'metadata',
    token: MetadataToken,
    scope: 'document',
    create: createMetadataController,
  });
```

`definePlugin<State, Capability>(definition)` returns its argument; it exists to
pin the two types, so `create` receives a `PluginContext<State>` and must
return a `Capability`.

| Field      | Meaning                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `id`       | Unique in the plugin list. Names the state slice and appears in errors.                          |
| `token`    | The capability token this plugin provides. Omit for a plugin without a capability.               |
| `scope`    | `'workspace'` (the default: one instance) or `'document'` (one instance per open document).      |
| `requires` | Tokens that must be installed. Validated when the kernel is created.                             |
| `optional` | Tokens this plugin uses when they are installed.                                                 |
| `state`    | `() => State`: the initial session state, built for every instance. Omit for a stateless plugin. |
| `create`   | `(ctx) => { api, connect? }`: builds one instance.                                               |

Configuration is an argument of the factory, passed on to the controller:

```ts
// packages/plugin/form/src/form.plugin.ts
export const formPlugin = (config: FormConfig = {}) =>
  definePlugin<FormState, FormHostCapability>({
    id: 'form',
    token: FormToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [AnnotationToken, ActionsToken],
    state: initialFormState,
    create: (ctx) => createFormController(ctx, config),
  });
```

A definition is an immutable recipe that two kernels may share. Nothing that
belongs to an instance (registries, caches, timers) lives in the manifest or
in module scope; it lives in the controller.

## Tokens and contracts

**The token.** `token.ts` calls `createCapabilityToken` once for the package.
The `hint` is appended to the error a user sees when a plugin requires this
token and it is not installed, so the error carries its own fix.

```ts
// packages/plugin/form/src/token.ts
export const FormToken = createCapabilityToken<FormCapability>('form', {
  hint: `add formPlugin() from '@embedpdf/plugin-form' to your plugins list`,
});
```

**The public lens.** `contract.ts` declares the capability interface
(`<Name>Capability`) and every type it mentions, and re-exports the token.
Application code, other plugins and adapters depend on this file. Every member
gets TSDoc as described in [`comments.md`](./comments.md): a one-sentence
summary, the `PluginError` codes it rejects with, and the events it fires.

**The host lens.** Some members exist only for sibling plugins and framework
adapters: registration seams, render feeds, sinks. They go into
`<Name>HostCapability extends <Name>Capability` in `host-contract.ts`, typed
over the same runtime token:

```ts
// packages/plugin/form/src/host-contract.ts
export interface FormHostCapability extends FormCapability {
  listFillItems(page: PageRef): FillItem[];
  ensureLoaded(page: PageRef): Promise<void>;
  // …
}

export const FormToken = createHostToken<FormHostCapability>(PublicFormToken);
```

`createHostToken` returns the same object typed wider, so both lenses resolve
the same instance. A plugin with a host lens registers the host token in its
manifest and types `definePlugin` with the host capability.

**Framework-only helpers.** `internal.ts` holds what adapters need and
applications must not use. It is a visibility boundary, not a bundle
boundary.

## Package entries and bundle boundaries

Every plugin package publishes deliberate dependency doors:

- `@embedpdf/plugin-<name>` is the implementation opt-in: import it for
  `<name>Plugin()`, or from the framework feature entry that installs and
  re-exports that plugin. The root re-exports the public contract.
- `@embedpdf/plugin-<name>/contract` is the public capability protocol: the
  one runtime token, the types, and small protocol helpers. Its runtime
  import graph must not reach the implementation (the manifest or the
  controller).
- `@embedpdf/plugin-<name>/contract/host` is optional. It exposes the host
  lens over the same token object.
- Named entries such as `/destination`, `/authoring` or `/scripting` expose a
  deliberate pure helper feature that is neither a contract nor the full
  implementation.

The source rules are mechanical:

1. Plugin source never imports another plugin's bare package root, not even
   for types. Use `/contract`, `/contract/host`, or a named helper entry.
2. Framework source follows the same rule for sibling plugins. A framework
   feature may import its own plugin's root only when that feature entry
   re-exports the root and therefore opts users into the implementation.
3. Application and composition source may import a bare plugin root in a
   module that imports that plugin's factory. Elsewhere, even type-only and
   token imports use the contract entry.
4. `requires` and `optional` describe kernel relationships. They do not
   create a JavaScript module boundary and do not replace contract imports.
5. The token is defined once. The root, `/contract`, `/contract/host` and
   `/internal` re-export or widen the same token; `createCapabilityToken` is
   never called twice.

`pnpm check:plugin-boundaries` checks these rules locally and in CI.

## The controller

`controller.ts` exports `create<Name>Controller(ctx, config?)`, the manifest's
`create`. It returns `{ api, connect? }`:

- `api` is the capability. It is built once and never replaced.
- `connect` runs once, after this plugin and its dependencies are created (see
  [`architecture.md`](./architecture.md#scopes-and-bring-up)). The first loads
  of the plugin's mirrors start right after it.

Inside `create` a controller creates its event sources, its mirrors and its
`ctx.state.onChange` listener, and assembles the reads and verbs. It may
resolve siblings it needs for its reads and verbs. It does not register
anything with a sibling, and does not subscribe to sibling events or to
document events (a mirror subscribes by itself); that is `connect`'s job.

A controller that grows past a few hundred lines splits into areas, one per
file under `read/`, `write/`, `sync/` and `tools/`. Each area is a function
that receives the context and the services it needs, and returns its slice of
the capability with `satisfies Partial<Capability>`. `composeApi` joins the
slices and throws if two slices define the same member:

```ts
// packages/plugin/form/src/controller.ts
export function createFormController(
  ctx: FormContext,
  config: FormConfig = {},
) {
  const services = createServices(ctx, config);
  const { events, authority } = services;

  const fields = createFieldReads(services);
  const widgets = createWidgetReads(ctx, services);
  const values = createValueWrites(ctx, services);
  // …

  const api = composeApi('form', [
    fields.api,
    widgets.api,
    values.api,
    // …
    {
      canFill: () => authority.can('doc.forms.fill'),
      onValueChanged: events.valueChanged.on,
      // …
    },
  ]) satisfies FormHostCapability;

  return {
    api,
    connect: () => connectForm(ctx, api),
  };
}
```

`services/` holds what several areas share, built once by
`createServices(ctx, config)`: the mirrors, the event sources, the authority
checks, resolved siblings, queues. A plugin that uses the context in many
files names its type once: `export type FormContext = PluginContext<FormState>`
in `services/context.ts`.

## `connect.ts`

Everything that registers with a sibling runs in `connect`: tools and
handlers on the interaction hub, behaviors on the annotation plugin, executors
and sinks on the actions plugin, subscriptions to sibling events, reactions
to document events, `ctx.watch` on state the plugin does not own. Every
registration's `Unsubscribe` goes to `ctx.cleanup`, even when both sides
close together.

```ts
// packages/plugin/link/src/connect.ts
export function connectLink(ctx: PluginContext<void>): void {
  const annotation = ctx.tryGet(AnnotationToken);
  if (!annotation) return;
  const interaction = ctx.get(InteractionToken);
  ctx.cleanup(
    annotation.registerBehavior({
      id: 'link-nav',
      matches: (target) => target.subtype === 'link',
      engaged: () =>
        interaction.getActiveTool()?.enables.has('link-nav') ?? false,
    }),
  );
}
```

## Dependencies

| Member                                  | Behavior                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ctx.get(token)`                        | The capability for this plugin's scope (this document, or the workspace). Throws when it cannot resolve. |
| `ctx.tryGet(token)`                     | The same, or `null` when the plugin is not installed or not available.                                   |
| `ctx.forDocument(token, documentId)`    | The capability for another document. For workspace plugins.                                              |
| `ctx.tryForDocument(token, documentId)` | The same, or `null`.                                                                                     |

- A plugin declares every token it resolves: required ones in `requires`,
  optional ones in `optional`. Its own token and `DocumentsToken` need no
  declaration. The host token of a plugin is the same object as its public
  token, so declaring either covers both.
- In development (`NODE_ENV` is not `production`), resolving an undeclared
  token throws:

  ```
  [kernel] plugin "x" resolved capability "y" without declaring it; add the token to its `requires` or `optional` list.
  ```

- The one exception is a plugin that resolves capabilities for code the host
  supplies, such as the commands plugin running command definitions. It sets
  `resolvesAnyCapability: true` in its manifest; the kernel then allows any
  token and neither orders nor validates those dependencies.

- `createKernel` validates the plugin list before building anything, and
  rejects: the same plugin installed twice, two plugins with one id, two
  plugins providing one token, a required token no plugin provides (with the
  token's `hint`), a workspace plugin that requires a document-scoped token,
  and dependency cycles.
- Plugins are created and connected in dependency order, so a required
  sibling exists when `create` runs.
- A workspace plugin reaches document plugins with `ctx.forDocument` and
  declares their tokens as `optional`.

## The document

- `ctx.doc` is the guarded engine handle of the plugin's document. Every call
  through it rejects `instance-closed` once the instance closed, is aborted
  when the instance closes, and rejects with `PluginError` instead of raw
  engine errors. It is never null in a document plugin, so it is never
  null-checked. Reading it in a workspace plugin throws.
- `ctx.document()` is the page registry (`DocumentMeta`: pages, revision,
  render policy). `ctx.getPage(ref)` returns one page or `null`;
  `ctx.assertPageRef(ref)` throws `not-found` for a foreign page.
- `ctx.geometry.forPage(ref)` converts between PDF space and page space for
  one page (throws `not-found`); `tryForPage` returns `null` instead.

## Lifetime and async

Everything a plugin acquires is owned by its instance and released when the
instance closes (a document plugin) or the kernel is destroyed (a workspace
plugin).

| Member                         | Behavior                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ctx.cleanup(teardown)`        | Run `teardown` at close. Asynchronous teardowns are awaited. Registering after the owner closed runs the teardown immediately.                                                                         |
| `ctx.listen(source, listener)` | Subscribe to an `EventHook` or anything with `subscribe` for the instance's lifetime. The kernel owns the unsubscribe.                                                                                 |
| `ctx.acquire(get, dispose)`    | `get(lifetime)` a resource and register `dispose`. A resource that arrives after close is disposed and the call rejects `instance-closed`.                                                             |
| `ctx.latest(key)`              | A newest-wins lane: `lane.run(async (run) => …, options)`. Starting a run aborts the previous one; a superseded run cannot publish (`run.commit(fn)` returns false) and rejects `operation-cancelled`. |
| `ctx.serialQueue(key?)`        | A per-key queue: operations run one at a time, in submission order, and a failure does not affect later operations.                                                                                    |
| `ctx.events.source<T>()`       | An event source, disposed at close.                                                                                                                                                                    |

- Queues come from `ctx.serialQueue(key)`, never from a local
  `createSerialQueue()`.
- An operation on queue A may enqueue into queue B and await it, but never
  the other way round on the same pair: that deadlocks.
- The search plugin runs every search on `ctx.latest('session')`, so a new
  query cancels the previous scan and a stale scan can never write its hits.

## Errors

A capability rejects (or throws) with `PluginError` only:

```ts
new PluginError(code, capability, message, { cause?, details? });
```

| Code                  | Meaning                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `permission-denied`   | The session may not do this. `details.required` names the missing capability. |
| `unsupported`         | The engine or document cannot do this.                                        |
| `not-found`           | A ref names nothing in this document.                                         |
| `not-ready`           | The resource is not loaded or the document not open yet.                      |
| `invalid-input`       | The arguments are wrong.                                                      |
| `conflict`            | A concurrent change or a version conflict.                                    |
| `instance-closed`     | The instance closed before the call finished.                                 |
| `operation-cancelled` | The caller cancelled, or a newer call superseded this one.                    |
| `operation-failed`    | Anything else.                                                                |

- Calls through `ctx.doc` already reject with `PluginError`: the guarded
  handle maps engine errors with `toPluginError(capability, error)`.
  Cancellation becomes `operation-cancelled`, never `operation-failed`.
- Code that catches something else converts it with `toPluginError`.
- State and event payloads carry the serializable summary
  `toPluginErrorInfo(error)`, never the error object.
- Callers match on `code` (`isPluginError(error, 'conflict')`), never on the
  message.
- A verb that can refuse has a `can*` twin, and its refusal is
  `permission-denied` with `details: { required }`
  ([`permissions.md`](./permissions.md)).
- A best-effort batch verb resolves with `BatchResult<T, R>`
  (`applied`, `skipped`, `failed`) instead of rejecting on the first failure.

## A minimal complete plugin

A document-scoped plugin that mirrors the document title and remembers
whether a title editor is open. It shows a mirror with a fold, fact events
with their origin, `onResynced`, session state with transitions and a derived
state-change event, a verb with a permission gate, and the manifest.

```ts
// token.ts
import { createCapabilityToken } from '@embedpdf/core';

import type { TitleCapability } from './contract';

export const TitleToken = createCapabilityToken<TitleCapability>('title', {
  hint: "add titlePlugin() from '@embedpdf/plugin-title' to your plugins list",
});
```

```ts
// contract.ts
import type {
  ChangeOrigin,
  EventHook,
  OperationOptions,
  ResourceStatus,
} from '@embedpdf/core';

export { TitleToken } from './token';

/** A confirmed change of the title, whoever made it. */
export interface TitleChangedEvent {
  readonly title: string | null;
  readonly previous: string | null;
  readonly origin: ChangeOrigin;
}

/** The title was loaded or reloaded from the engine. */
export interface TitleResyncedEvent {
  readonly title: string | null;
}

/** The title editor opened or closed. */
export interface TitleEditorChangedEvent {
  readonly open: boolean;
}

export interface TitleCapability {
  /** The confirmed title; null before the first load lands or when the document has none. */
  getTitle(): string | null;
  /** Load state of the title. */
  getStatus(): ResourceStatus;
  /** Whether this session may change the title. */
  canEdit(): boolean;
  /**
   * Set the title. When it resolves, `getTitle()` returns the new title and
   * `onTitleChanged` has fired. Rejects with `permission-denied`,
   * `operation-cancelled` or `instance-closed`.
   */
  setTitle(title: string | null, options?: OperationOptions): Promise<void>;
  /** Whether the title editor is open. */
  isEditorOpen(): boolean;
  /** Open the title editor. Fires `onEditorChanged`. */
  openEditor(): void;
  /** Close the title editor. Fires `onEditorChanged`. */
  closeEditor(): void;
  /** Read the title from the engine again. */
  refresh(): Promise<void>;
  /** A confirmed title change, from this session or another. */
  readonly onTitleChanged: EventHook<TitleChangedEvent>;
  /** The title was loaded or reloaded. */
  readonly onResynced: EventHook<TitleResyncedEvent>;
  /** The editor opened or closed. */
  readonly onEditorChanged: EventHook<TitleEditorChangedEvent>;
}
```

```ts
// model.ts
import type { DocumentEvent } from '@embedpdf/core';

/** The session state: whether the title editor is open. */
export interface TitleState {
  readonly editorOpen: boolean;
}

export const initialTitleState = (): TitleState => ({ editorOpen: false });

export const openEditor = (state: TitleState): TitleState =>
  state.editorOpen ? state : { ...state, editorOpen: true };

export const closeEditor = (state: TitleState): TitleState =>
  state.editorOpen ? { ...state, editorOpen: false } : state;

/** Apply one confirmed event to the mirrored title. The same for every origin. */
export const foldTitle = (
  title: string | null,
  event: DocumentEvent,
): string | null =>
  event.type === 'metadata.updated' ? event.metadata.title : title;
```

```ts
// controller.ts
import {
  originOf,
  PluginError,
  type DocCapability,
  type PluginContext,
} from '@embedpdf/core';

import type {
  TitleCapability,
  TitleChangedEvent,
  TitleEditorChangedEvent,
  TitleResyncedEvent,
} from './contract';
import { closeEditor, foldTitle, openEditor, type TitleState } from './model';

const EDIT_SCOPE: DocCapability = 'doc.metadata.modify';

export function createTitleController(ctx: PluginContext<TitleState>) {
  const titleChanged = ctx.events.source<TitleChangedEvent>();
  const resynced = ctx.events.source<TitleResyncedEvent>();
  const editorChanged = ctx.events.source<TitleEditorChangedEvent>();

  // The confirmed title: changed only by loads and by folding confirmed events.
  const title = ctx.mirror<string | null>({
    name: 'title',
    initial: () => null,
    load: async (doc) => ({ value: (await doc.metadata.read()).title }),
    fold: foldTitle,
    changed: ({ cause, event, previous, next }) => {
      if (cause === 'load') resynced.emit({ title: next });
      else if (event?.type === 'metadata.updated') {
        titleChanged.emit({ title: next, previous, origin: originOf(event) });
      }
    },
  });

  // State-change events, derived from every committed change.
  ctx.state.onChange(({ previous, next }) => {
    if (previous.editorOpen !== next.editorOpen)
      editorChanged.emit({ open: next.editorOpen });
  });

  const canEdit = () => ctx.doc.security.allows(EDIT_SCOPE);

  const api: TitleCapability = {
    getTitle: title.get,
    getStatus: title.getStatus,
    canEdit,
    async setTitle(next, options) {
      if (options?.signal?.aborted) {
        throw new PluginError(
          'operation-cancelled',
          'title',
          'setTitle was cancelled',
        );
      }
      if (!canEdit()) {
        throw new PluginError(
          'permission-denied',
          'title',
          `setTitle requires ${EDIT_SCOPE}`,
          {
            details: { required: EDIT_SCOPE },
          },
        );
      }
      // The engine publishes `metadata.updated` before this resolves, so the
      // mirror holds the new title when the await returns.
      await ctx.doc.metadata.update({ title: next });
    },
    isEditorOpen: () => ctx.state.get().editorOpen,
    openEditor: () => ctx.state.update(openEditor),
    closeEditor: () => ctx.state.update(closeEditor),
    refresh: () => title.refresh(),
    onTitleChanged: titleChanged.on,
    onResynced: resynced.on,
    onEditorChanged: editorChanged.on,
  };

  return { api };
}
```

```ts
// title.plugin.ts
import { definePlugin } from '@embedpdf/core';

import { TitleToken, type TitleCapability } from './contract';
import { createTitleController } from './controller';
import { initialTitleState, type TitleState } from './model';

/** The document title, mirrored from the engine, and whether its editor is open. */
export const titlePlugin = () =>
  definePlugin<TitleState, TitleCapability>({
    id: 'title',
    token: TitleToken,
    scope: 'document',
    state: initialTitleState,
    create: createTitleController,
  });
```

```ts
// index.ts
export { titlePlugin } from './title.plugin';
export * from './contract';
```

Its tests are in [`testing.md`](./testing.md#the-test-context).

## Checklist

- The manifest only calls `definePlugin`; configuration reaches the
  controller through `create`.
- One `createCapabilityToken` call, in `token.ts`; a host lens uses
  `createHostToken`.
- Every token the plugin resolves is in `requires` or `optional`, and is
  imported from a `/contract` entry.
- Session state changes only through transitions in `model.ts`.
- Engine data lives in a mirror or page mirror; verbs never write it.
- Events come from `ctx.events.source()`; fact events from where the
  confirmed event is applied, state-change events from `ctx.state.onChange`.
- Sibling registrations and subscriptions are in `connect`, and every
  `Unsubscribe` goes to `ctx.cleanup`.
- Every rejection is a `PluginError`, and the contract's TSDoc lists its codes.
- Tests under `test/` mirror `src/` (see [`testing.md`](./testing.md)).

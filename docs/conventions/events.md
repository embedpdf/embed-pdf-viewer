# Events

A capability's events report what happened. What something is, is read
through a getter. This document covers the three kinds of events, where each
one fires, how events are created and named, and how a fact event says where
its change came from.

## Three kinds

| Kind         | Meaning                                             | Fired from                                     | Origin                            | Examples                                                                                                                                             |
| ------------ | --------------------------------------------------- | ---------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fact         | Something changed in the document                   | Where the confirmed document event is applied  | `originOf(event)`                 | metadata `onUpdated`; form `onValueChanged`, `onFieldCreated`; annotation `onCreated`, `onDeleted`; signature `onSigned`; redaction `onApplied`      |
| State change | A session value changed                             | The plugin's one `ctx.state.onChange` listener | none: session state has no origin | shell `onSurfaceOpened`; stage `onZoomChanged`, `onPageChanged`; search `onActiveHitChanged`                                                         |
| Occurrence   | An operation ran, was requested, finished or failed | Where the operation reaches that point         | a domain field when one is needed | search `onStarted`, `onCompleted`, `onFailed`; stage `onMotionEnded`; form `onValidationRejected`; commands `onExecuted`; annotation `onWriteFailed` |

### Fact events

A fact event fires where the plugin applies the confirmed document event:

- in a mirror's `changed` callback, for data the plugin mirrors
  (`packages/plugin/form/src/sync/fields.ts`,
  `packages/plugin/metadata/src/controller.ts`);
- in the plugin's one `ctx.listen(ctx.doc.events, …)` handler for that event
  type, for data it does not mirror (`packages/plugin/redaction/src/sync/document-events.ts`).

Because the confirmed event is the only source, the same event fires for this
session's writes, the document's scripts and other sessions, and it fires
once. A verb never emits a fact event itself.

```ts
// packages/plugin/form/src/sync/fields.ts, inside the mirror spec
changed: ({ cause, event, previous, next }) => {
  if (cause === 'load') {
    if (next.snapshot) events.resynced.emit({ snapshot: next.snapshot });
    return;
  }
  if (!event || !('origin' in event)) return;
  const origin = originOf(event);
  switch (event.type) {
    case 'forms.valueSet':
      events.valueChanged.emit({ ref: event.field.ref, field: event.field, origin });
      return;
    // …
  }
},
```

### State-change events

A plugin derives all of its state-change events in one `ctx.state.onChange`
listener, from the value before and after each committed change. A new verb
therefore cannot forget to announce, and a verb never emits a state-change
event itself.

```ts
// packages/plugin/shell/src/controller.ts
ctx.state.onChange(({ previous, next }) => {
  if (previous.openMenus !== next.openMenus) {
    for (const id of previous.openMenus) {
      if (!next.openMenus.includes(id)) menuClosed.emit({ id });
    }
    for (const id of next.openMenus) {
      if (!previous.openMenus.includes(id)) menuOpened.emit({ id });
    }
  }
});
```

### Occurrence events

An occurrence fires where the operation reaches the point it reports: the
search scan emits `onProgress` per slice and `onCompleted` when the scan is
complete; the stage's camera animation emits `onMotionEnded` where a tween or
fling ends; the form write path emits `onValidationRejected` when the
document's scripts refuse a value. An occurrence that needs to say who asked
carries a domain field for it (the actions plugin's `ActionContext.origin`),
not a `ChangeOrigin`.

## Rules

- An event fires from exactly one place.
- A verb never emits a fact or state-change event.
- Loads and reloads are announced once, as `onResynced`. They never produce
  per-item fact events.
- Events are for things that happened. A UI never keeps its own copy of state
  by listening to events; it reads through a getter and a selector. A late
  subscriber that needs the current value calls the getter.
- Payloads are plain, serializable objects with `readonly` fields.

## Creating events

A plugin creates each event with `ctx.events.source<T>()`:

```ts
const updated = ctx.events.source<MetadataUpdatedEvent>();
// { on: EventHook<T>, emit(event: T): void, dispose(): void }

const api: MetadataCapability = {
  // …
  onUpdated: updated.on,
};
```

- The capability exposes only `.on`, typed `EventHook<T>`. `emit` and
  `dispose` stay inside the plugin, so the emitting half cannot be reached
  through the contract.
- The kernel disposes every source when the instance closes.
- Plugins do not call `createEventHook` directly; it exists for the kernel
  and the adapters.

Delivery (`packages/core/main/src/event-hook.ts`):

- `emit` calls the listeners synchronously, over a snapshot of the listener
  set taken at the start of the emit.
- A throwing listener is reported and never breaks the emitting operation or
  the other listeners.
- `on(listener, { signal })` ties the subscription to an `AbortSignal`, and
  returns an `Unsubscribe`.
- There is no replay and no cached value.

## Naming

- A capability event is `on<Subject?><PastParticiple>`: `onFieldCreated`,
  `onZoomChanged`, `onSurfaceOpened`, `onApplied`.
- A value that changes is announced as `on<Value>Changed`: `onZoomChanged`,
  `onLocaleChanged`, `onActiveHitChanged`.
- A load or reload is `onResynced`.
- The payload type is named after its event: `onFieldCreated` →
  `FieldCreatedEvent` (usually prefixed with the plugin:
  `MetadataUpdatedEvent`, `SearchCompletedEvent`).

The full vocabulary is in [`naming.md`](./naming.md#capability-vocabulary).

## Origin

Every fact event carries `origin: ChangeOrigin`, taken from the engine's event
with `originOf`. No plugin builds an origin by hand.

```ts
// packages/core/main/src/types.ts
interface ChangeOrigin {
  /** `local` when this engine instance made the change, `remote` for another session. */
  readonly locality: 'local' | 'remote';
  /** The engine session that made the change. */
  readonly sessionId: string;
  /** The authenticated user behind the change (cloud); null for local engines. */
  readonly actorId: string | null;
}

function originOf(event: {
  origin: { kind: 'local' | 'remote'; sessionId: string; sub: string | null };
}): ChangeOrigin;
```

- `locality: 'local'` means this engine instance, not this user: the same
  user in two tabs is two sessions, and each tab sees the other's changes as
  `remote`.
- Ask `locality` or `sessionId` for "is this my own action?" (undo,
  reconciling optimistic state). Ask `actorId` for attribution.
- Handlers that update state ignore origin (see
  [`state-and-sync.md`](./state-and-sync.md#rules)); origin is for the few
  features that care about provenance.
- `stream.desynced` carries no origin: it is a transport notice, not a
  mutation. A mirror turns it into a reload and an `onResynced`.
- An event that a verb can cause as well as a document event carries
  `origin: ChangeOrigin | null`, with `null` for the verb: render's
  `onInvalidated` after `invalidate()`.

## Resynced

`onResynced` fires when a mirror's load lands: the first load, a `refresh()`,
and every reload after `stream.desynced`, `document.versioned` or a fold that
asked for one. Its payload says what was read, never what changed:

| Plugin     | Payload                         |
| ---------- | ------------------------------- |
| metadata   | `{ metadata }`                  |
| form       | `{ snapshot }`                  |
| annotation | `{ pages: 'all' \| PageRef[] }` |

A subscriber that cares about the new content reads it through the getters.

## Subscribing

- **Inside a plugin**: `ctx.listen(source, listener)`, where `source` is an
  `EventHook` (`annotation.onCreated`) or anything with `subscribe`
  (`ctx.doc.events`). The kernel owns the unsubscribe; subscriptions to
  siblings are made in `connect`.
- **In React**: `useCapabilityEvent(Token, (capability) => capability.onX, handler)`,
  or the per-plugin helper (`useMetadataEvent`, `useSearchEvent`, …).
  Angular has `injectCapabilityEvent`. Both subscribe for the component's
  lifetime.
- **Anywhere else**: `const off = capability.onX(handler)`, or pass
  `{ signal }` and abort it.

The kernel's own document lifecycle events live on the documents capability
(`DocumentsToken`): `onOpened`, `onOpenFailed`, `onLocked`, `onClosed`,
`onActiveChanged` and `onPagesChanged`.

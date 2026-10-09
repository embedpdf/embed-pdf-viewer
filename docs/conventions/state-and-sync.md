# State and sync

Where a plugin keeps each piece of state, how that state changes, and how a
plugin's copy of engine data stays equal to what the engine confirmed. The
kinds of state are introduced in [`architecture.md`](./architecture.md); every
API below is a member of the `PluginContext` a plugin's `create(ctx)` receives
(`packages/core/main/src/types.ts`).

| Kind            | API                                                                         |
| --------------- | --------------------------------------------------------------------------- |
| Session         | `ctx.state` (`get`, `update`, `onChange`)                                   |
| Mirror          | `ctx.mirror(spec)`, `ctx.pageMirror(spec)`                                  |
| Pending changes | `ctx.changes` (`stage`, `hold`, `group`), a mirror's `predict` and `view()` |
| Resource        | closures, `ctx.notify()`, `ctx.cleanup`, `ctx.acquire`                      |

## Session state: `ctx.state`

```ts
interface StateCell<S> {
  get(): S;
  update<Args extends unknown[]>(
    transition: (state: S, ...args: Args) => S,
    ...args: Args
  ): void;
  readonly onChange: EventHook<StateChange<S>>; // { previous, next }
}
```

- The manifest's `state: () => S` builds the initial value, fresh for every
  instance. A plugin without session state omits it and its context is
  `PluginContext<void>`.
- The value is replaced, never mutated. It is plain data (see the rules in
  [`architecture.md`](./architecture.md#four-kinds-of-state)).
- It changes only through `update(transition, ...args)`. A transition is a
  named, exported, pure function in `model.ts`: `(state, ...args) => state`.
  Its name says what happens; there are no action objects or reducers.
- A transition that returns the same object is a no-op: no store
  notification and no `onChange`. Write transitions so they return `state`
  itself when nothing changes.
- `onChange` fires synchronously, before `update` returns, with the previous
  and next value. It is where a plugin derives its state-change events (see
  [`events.md`](./events.md)).
- After the instance closed, `update` drops the write and reports
  `instance-closed` once.

From `packages/plugin/shell`:

```ts
// model.ts
export function openMenu(state: ShellState, id: string): ShellState {
  if (state.openMenus.includes(id)) return state;
  return { ...state, openMenus: [...state.openMenus, id] };
}

export function closeMenu(state: ShellState, id: string): ShellState {
  if (!state.openMenus.includes(id)) return state;
  return { ...state, openMenus: state.openMenus.filter((menu) => menu !== id) };
}

// controller.ts
openMenu: (id) => ctx.state.update(openMenu, id),
closeMenu: (id) => ctx.state.update(closeMenu, id),
```

## `ctx.notify()`

Wakes every subscriber of the store's change stream without changing state.
Call it when a resource changed and reads through the capability now answer
differently: a registry gained an entry, a raster arrived, a policy changed.
It is a no-op once the instance closed.

```ts
// packages/plugin/commands/src/controller.ts: definitions hold functions,
// so the registry is a closure map; every change wakes the readers.
ctx.notify();
```

## `ctx.watch(select, handler, isEqual?)`

Runs `handler(value, previous)` whenever `select()` answers differently after a
store change (`Object.is` unless `isEqual` is given). It never runs for the
initial value. Use it to react to state this plugin does not own: the page
registry, a sibling's getter. A plugin observes its own state with
`ctx.state.onChange` instead. The subscription ends when the instance closes;
the returned `Unsubscribe` ends it earlier.

```ts
// packages/plugin/stage/src/connect.ts
ctx.watch(
  () => ctx.document()?.revision ?? 0,
  () => stage.refit(),
);
```

## `ctx.waitFor(predicate, options?)`

Resolves once `predicate()` holds, checked immediately and after every store
change. Rejects with `operation-cancelled` when `options.signal` aborts, with
`instance-closed` when the instance closes, and with the predicate's own error
if it throws. A verb never uses it to see its own engine write (see
[the rules](#rules)).

## Mirrors: `ctx.mirror(spec)`

A mirror is a local copy of document-wide data the engine owns. It changes in
two ways only: a load (the whole value, or some pages of it) and a fold (one
confirmed event applied by a pure function). Mirrors exist in
document-scoped plugins only.

| Spec member                      | Meaning                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                           | Unique within the plugin; names the store cell and appears in errors.                                                                                                                 |
| `initial()`                      | The value before the first load lands.                                                                                                                                                |
| `readable?()`                    | Asked before every load. `false`: status `forbidden`, no engine read.                                                                                                                 |
| `load(doc, signal)`              | Read the whole value: `{ value, cursor? }`. `cursor` is the newest server event the snapshot already contains (cloud engines); omit it otherwise.                                     |
| `fold(value, event)`             | Apply one confirmed event. Pure, the same for every origin. Returns `value` itself when the event does not apply, or `reload(...)` when the event does not carry enough to apply.     |
| `predict?(value, op)`            | Apply one op of this session's pending changes, as the engine will. Pure and absolute (see [Pending changes](#pending-changes)). Returns `value` itself for an op it doesn't concern. |
| `loadPages?(doc, pages, signal)` | Read some pages and return `(value) => value` merging them in. Needed when `fold` returns `reload({ pages })`.                                                                        |
| `changed?(change)`               | Runs after every load (even one that changed nothing) and after every event that changed the value. The one place the plugin emits the events this data drives.                       |

The metadata plugin is a complete mirror plugin in one file
(`packages/plugin/metadata/src/controller.ts`):

```ts
const metadata = ctx.mirror<DocumentMetadata | null>({
  name: 'metadata',
  initial: () => null,
  load: async (doc) => ({ value: await doc.metadata.get() }),
  fold: (value, event) =>
    event.type === 'metadata.updated' ? event.metadata : value,
  changed: ({ cause, event, previous, next }) => {
    if (!next) return;
    if (cause === 'load') {
      resynced.emit({ metadata: next });
    } else if (event && 'origin' in event) {
      updated.emit({
        metadata: next,
        previous,
        changedKeys: changedKeys(previous, next),
        origin: event.origin,
      });
    }
  },
});
```

A fold with several cases lives in `model.ts` as a named function, so it can
be tested without a kernel (`packages/plugin/form/src/model.ts`):

```ts
export function foldFormEvent(
  index: FieldIndex,
  event: DocumentEvent,
): FieldIndex | MirrorReload {
  switch (event.type) {
    case 'forms.valueSet':
    case 'forms.updated':
    case 'forms.widgetAdded':
    case 'forms.widgetRemoved':
      return upsertFields(index, [event.field]);
    case 'forms.deleted':
      return removeField(index, event.deletedFieldObjectNumber);
    case 'forms.imported':
      return indexFields(event.snapshot);
    case 'forms.repaired':
      return reload();
    // …
    default:
      return index;
  }
}
```

### The mirror's life

1. **Subscribe first.** The mirror subscribes to `ctx.doc.events` when it is
   created, inside `create`.
2. **Load after connect.** The first load starts right after the plugin's
   `connect` has run, so capabilities that `readable` or `load` use exist.
3. **Queue during a load.** Events that arrive while a full load runs are
   queued. When the load lands, the queued events are replayed in arrival
   order, skipping those the snapshot already contains
   (`origin.serverId <= cursor`). Replaying confirmed records in order is
   idempotent, so engines without a cursor replay everything.
4. **Degrade on failure.** A failed load keeps the previous value, applies the
   queued events to it, and reports `forbidden` (a `permission-denied`
   rejection) or `error` through `getStatus()`. The mirror stays live. A
   failed page reload does the same: the value is stale for those pages, and
   says so, until a full load succeeds.
5. **Resync.** `stream.desynced` and `document.versioned` start a full reload.
   `fold` never sees them.
6. **Throwing folds.** A `fold` that throws is reported and starts a full
   reload.
7. **Coalescing.** A reload requested while one runs schedules exactly one
   more after it.
8. **Storage.** The value lives in a store cell of its own
   (`<plugin id>::<document id>/mirror/<name>`), revoked when the instance
   closes. It is reactive through the ordinary change stream, and a closed
   instance cannot write it.

The kernel tests each step in `packages/core/main/test/mirror.test.ts`.

### Partial reloads

`fold` returns `reload()` to read everything again, or `reload({ pages })` to
read only some pages through `loadPages`. Without `loadPages`, a page-scoped
request reloads everything. The annotation records mirror
(`packages/plugin/annotation/src/sync/records.ts`) re-reads only the pages a
redaction or a flatten touched:

```ts
case 'redaction.applied':
case 'pages.flattened': {
  const pages = event.results
    .filter((result) => result.status === 'applied')
    .map((result) => result.page);
  return pages.length ? reload({ pages }) : records;
}
```

### What `changed` receives

```ts
interface MirrorChange<V> {
  readonly cause: 'load' | 'event';
  readonly event: DocumentEvent | null; // null for loads
  readonly pages: 'all' | readonly PageRef[] | null; // loads only: what was read
  readonly previous: V;
  readonly next: V;
}
```

### Status and control

| Member        | Behavior                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get()`       | The value the engine confirmed.                                                                                                                                          |
| `view()`      | What the user sees: `get()` with this session's pending changes replayed on top through `predict`. `get()` when the spec has no `predict`.                               |
| `getStatus()` | `idle` until the first load starts, `loading` while it runs, then `ready`. Stays `ready` while a reload runs. `forbidden` or `error` after a failed load or page reload. |
| `refresh()`   | Reload everything. Joins a running load; rejects when the load fails.                                                                                                    |
| `settled()`   | Resolves once no load or page reload runs, including reloads started while it waits. Never rejects.                                                                      |

A capability usually passes these through: `getStatus: metadata.getStatus`,
`refresh: () => metadata.refresh()`.

## Page mirrors: `ctx.pageMirror(spec)`

A page mirror holds engine data that is read page by page, on demand. A page
is `idle` until something calls `ensureLoaded(page)`; once loaded, it stays
current.

| Spec member                 | Meaning                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                      | Unique within the plugin.                                                                                                                                                    |
| `load(doc, page, signal)`   | Read one page's value.                                                                                                                                                       |
| `affected(event)`           | Which pages an event makes stale: a list, `'all'` (every loaded page), or `null`. Only loaded pages are touched.                                                             |
| `fold?(value, event, page)` | Apply an event to an affected page instead of re-reading it; return `'reload'` to re-read. Without `fold`, affected pages are re-read.                                       |
| `predict?(value, op, page)` | Apply one op of this session's pending changes to a loaded page's value, as a mirror's `predict` does.                                                                       |
| `changed?(change)`          | Runs after every load of a page (even one that changed nothing) and every applied change. `change` is `{ page, cause: 'load' \| 'event' \| 'drop', event, previous, next }`. |

| Member               | Behavior                                            |
| -------------------- | --------------------------------------------------- |
| `get(page)`          | The page's value, or `undefined` before it loaded.  |
| `view(page)`         | `get(page)` with the pending changes on top.        |
| `getStatus(page)`    | `idle`, `loading`, `ready`, `forbidden` or `error`. |
| `ensureLoaded(page)` | Load the page unless it is loaded or loading.       |
| `refresh(page?)`     | Re-read one page, or every loaded page.             |

Built in:

- a load for a page that is already loading shares the running read;
- every read and fold bumps a per-page epoch, so an older read never
  overwrites a newer value;
- `pages.deleted` drops the deleted pages (`cause: 'drop'`);
- `stream.desynced` and `document.versioned` re-read every loaded page;
- a failed read keeps the page's previous value and sets its status.

From `packages/plugin/link/src/controller.ts`:

```ts
const pages = ctx.pageMirror<readonly Link[]>({
  name: 'links',
  load: async (doc, page) => {
    const layout = ctx.getPage(page);
    if (!layout) {
      throw new PluginError(
        'not-found',
        'link',
        `page ${page.objectNumber} is not in this document`,
      );
    }
    const snapshot = await doc.page(page).annotations.list();
    return linksOf(snapshot.annotations, page, layout.boxes.crop);
  },
  affected: pagesChangedBy,
  changed: ({ page, cause }) => {
    if (cause === 'load') loaded.emit({ page });
  },
});
```

## Pending changes

A user action is one change: a list of the engine's ops (`ChangeOp`),
applied all or nothing by `doc.apply`, sent as one request, undone as one
step. A plugin describes its writes as ops and stages them on the document's
change queue, `ctx.changes`, which every plugin of the document shares:

```ts
// Moving three selected annotations.
ctx.changes.stage({
  label: { key: 'annotation.move', count: 3 },
  ops: moved.map(({ ref, rect }) => ({
    type: 'annotations.update',
    ref,
    patch: { rect },
  })),
  undo: before.map(({ ref, rect }) => ({
    type: 'annotations.update',
    ref,
    patch: { rect },
  })),
});
```

- **Shown at once.** Before `stage` returns, every mirror's `view()` shows the
  change: the mirror replays the pending changes over its value, op by op,
  through its spec's `predict`.
- **Sent in order.** The queue sends a change after everything staged before
  it; the engine keeps that order. `stage` returns the `PendingChange`: its
  `opId` (what its events carry as `origin.tx.id`) and `result`, the engine's
  answer.
- **`label`** names it in history and refusals: an i18n key and its values.
  **`undo`** says what undoing it looks like, so a history can draw it; it is
  never sent. `history: false` keeps a change out of the history.

### Predict

`predict` is the engine's own rule for an op, from the engine-core functions
the engine follows, next to the mirror's `fold` (the annotation plugin's
`predictRecords`, in `sync/records.ts`).

- **Pure and absolute.** Ops say what to set, never by how much, so replaying
  an op over a value that already holds its answer changes nothing. Both
  engines publish a change's events before they answer, so for a moment the
  mirror holds the answer and the change is still pending; with absolute ops
  that moment looks exactly like the answer.
- **Keep what an op doesn't touch.** Return the same object for every record
  an op leaves alone, so readers of the other records don't run again.
  `view()` is memoized on the value and the pending list.
- **Reads show the view.** What a plugin's reads hand out (`list`, `get`, its
  render items) comes from `view()`. `get()` stays the confirmed truth, for
  code that must not see a prediction.

### When a change leaves the view

| The engine…         | The change leaves…                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| applied it          | each mirror's view once that mirror holds the answer: once it folded the change's last event, even before the answer arrives; after the read a `fold` asked for, when it asked; and a mirror that couldn't read keeps it until a load lands |
| refused it          | every view, at once, together with its dependents                                                                                                                                                                                           |
| the document closed | nothing is shown any more; its `result` rejects `instance-closed`                                                                                                                                                                           |

**Dependents.** A create can name its object (`objectNumber`, from
`ctx.changes.takeObjectNumber()`), so later changes can refer to it before the
engine answers. When that create is refused, the changes that refer to what
only it would have created can't apply: the queue refuses them too (`conflict`,
`details.reason: 'dependency-refused'`) and aborts their engine calls.
`onSettled` reports every answer, refusals with their label.

### Holds and groups

- **A hold** is a change that can still be amended before it is sent: typing,
  or a form commit waiting for its scripts. `ctx.changes.hold(label)` returns it;
  `set(ops, undo?)` replaces its ops, and the views show the latest. Any later
  `stage` sends the open holds first, and `send()` sends the holds staged
  before it too, so send order is always staging order. `cancel()` drops it.
  `open` says whether it can still be amended: once sent, what comes after
  goes into a new hold. `change` is the change it is once it has ops (its
  `opId`, its answer). The plugin decides when it's done (a pause in typing,
  `ctx.clock.after`); the kernel sends every open hold before a download.
- **A group** makes everything staged while its `run` runs, by any plugin, one
  change: `ctx.changes.group(label, () => { … })`. Only what is staged before
  `run` returns joins; a verb that awaits first stages its own change. Nested
  groups join the outer one, a hold inside a group is refused, and when `run`
  throws nothing of it is sent.

### One change, one store update

Both engines publish a change's events in one burst that shares `origin.tx`.
The kernel holds the store's notifications while a burst arrives, so readers
see a change land in one update, whoever made it.

The kernel tests each rule in `packages/core/main/test/changes.test.ts`.

The annotation plugin is the reference: one change per message
(`services/store.ts`), its records mirror predicts (`sync/records.ts`), new
records are named by the object numbers they take, and typing is a hold
(`write/text-editing.ts`).

## Held-back writes

Some writes wait on purpose: the annotation plugin sends typed text once
typing pauses (a hold), the ink tool waits for the next stroke of a drawing, a
form field is written on blur. A hold (see [Pending changes](#pending-changes)) is
how a change waits, and the kernel sends every open hold before a download
itself. A write queue holds writes that are on their way.
Before anything reads the whole file (`documents.download()`, `downloadLayer()`), the
kernel settles the document (`packages/core/main/src/settle.ts`): it runs every
flush plugins registered with `ctx.onSettle(flush)` and waits for them, so the
file has everything the user sees.

- A flush sends what the plugin holds back and resolves once the engine has
  it: the ink draft finished between strokes (never a stroke still being
  drawn), the field being typed in committed (matches Acrobat: the field being
  edited is committed before a save). Holds need no flush: the kernel sends
  them.
- A plugin whose queue carries document writes registers it:
  `ctx.onSettle(() => queue.idle())`. A queue whose operations read the file
  themselves is never registered: the actions plugin runs every download
  inside its queue (`ctx.aroundDownload`, for the document's save actions),
  and waiting for that queue would wait for itself.
- A failed flush is reported and does not stop the read: the file is then what
  the engine has.
- The caller's `signal`, or the document closing, cancels the wait with
  `operation-cancelled`.

## Resources

Anything that is not plain data is a resource: engine handles, rasters,
workers, script realms, registries of functions, caches. A resource lives in a
closure inside the controller.

- Acquire it with `ctx.acquire(get, dispose)` or pair it with
  `ctx.cleanup(dispose)` on the line after acquiring it (see
  [`plugins.md`](./plugins.md#lifetime-and-async)).
- When it changes in a way reads can see, call `ctx.notify()`.
- Never put it into `ctx.state` or a mirror.

## Reactions

A reaction responds to confirmed document events without keeping a copy of
the data. It subscribes in `connect`, ignores origin for what it does, and
touches only its own caches and operations. The render plugin maps each event
to the pixels it changes (`packages/plugin/render/src/invalidation.ts`) and
invalidates them:

```ts
connect() {
  ctx.listen(ctx.doc.events, (event) => {
    const change = pixelChangeOf(event, allPageObjectNumbers);
    if (!change) return;
    publishInvalidation(change.pages, change.scope, 'origin' in event ? event.origin : null);
  });
},
```

Other reactions: search re-runs its query after any confirmed mutation, the
signature plugin re-judges its verdicts after edits of the working copy, and
the actions plugin clears its per-page trigger cache.

## Rules

1. A mirror changes only by `fold` and by loads. Verbs never write it.
2. `fold` is pure and ignores origin. Origin may shape presentation, never
   data, and only outside the fold: the annotation plugin renders another
   session's change from the engine's baked appearance, and records this
   session edited or created from their description (a session preference,
   `vector` in its state).
3. `fold` applies the data the event carries. It asks for a reload only when
   the event does not carry enough (`forms.repaired`, or `redaction.applied`
   for annotations).
4. Verbs stage a change (or call the engine) and return. They do not
   refetch, do not wait for revisions, and do not emit fact events.
5. A verb's `await` sees its own write. Both engines publish the event for a
   session's own mutation before the mutation's promise settles, so the fold
   and the fact events have run by the time the verb resumes.
6. Fact events come from `changed` (or from the plugin's one listener for that
   event) with `event.origin`. Loads announce `onResynced`.
7. Reactions subscribe with `ctx.listen` in `connect`.
8. `refresh()` exists for recovery and for callers that want a fresh read. No
   write path calls it.
9. What the user sees is `view()`: the truth with this session's pending
   changes on top. Nothing else keeps a copy of a pending change.

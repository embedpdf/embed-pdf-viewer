# State and sync

Where a plugin keeps each piece of state, how that state changes, and how a
plugin's copy of engine data stays equal to what the engine confirmed. The
kinds of state are introduced in [`architecture.md`](./architecture.md); every
API below is a member of the `PluginContext` a plugin's `create(ctx)` receives
(`packages/core/main/src/types.ts`).

| Kind     | API                                                                      |
| -------- | ------------------------------------------------------------------------ |
| Session  | `ctx.state` (`get`, `update`, `onChange`)                                |
| Mirror   | `ctx.mirror(spec)`, `ctx.pageMirror(spec)`                               |
| Overlay  | session state, matched to confirmations in a mirror's `changed` callback |
| Resource | closures, `ctx.notify()`, `ctx.cleanup`, `ctx.acquire`                   |

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

| Spec member                      | Meaning                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                           | Unique within the plugin; names the store cell and appears in errors.                                                                                                             |
| `initial()`                      | The value before the first load lands.                                                                                                                                            |
| `readable?()`                    | Asked before every load. `false`: status `forbidden`, no engine read.                                                                                                             |
| `load(doc, signal)`              | Read the whole value: `{ value, cursor? }`. `cursor` is the newest server event the snapshot already contains (cloud engines); omit it otherwise.                                 |
| `fold(value, event)`             | Apply one confirmed event. Pure, the same for every origin. Returns `value` itself when the event does not apply, or `reload(...)` when the event does not carry enough to apply. |
| `loadPages?(doc, pages, signal)` | Read some pages and return `(value) => value` merging them in. Needed when `fold` returns `reload({ pages })`.                                                                    |
| `changed?(change)`               | Runs after every load (even one that changed nothing) and after every event that changed the value. The one place the plugin emits the events this data drives.                   |

The metadata plugin is a complete mirror plugin in one file
(`packages/plugin/metadata/src/controller.ts`):

```ts
const metadata = ctx.mirror<DocumentMetadata | null>({
  name: 'metadata',
  initial: () => null,
  load: async (doc) => ({ value: await doc.metadata.read() }),
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
        origin: originOf(event),
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
    case 'form.valueChanged':
    case 'form.fieldUpdated':
    case 'form.widgetAttached':
    case 'form.widgetDetached':
      return upsertFields(index, [event.field]);
    case 'form.fieldDeleted':
      return removeField(index, event.deletedFieldObjectNumber);
    case 'form.imported':
      return indexFields(event.snapshot);
    case 'form.repaired':
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
| `get()`       | The current value.                                                                                                                                                       |
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
| `changed?(change)`          | Runs after every load of a page (even one that changed nothing) and every applied change. `change` is `{ page, cause: 'load' \| 'event' \| 'drop', event, previous, next }`. |

| Member               | Behavior                                            |
| -------------------- | --------------------------------------------------- |
| `get(page)`          | The page's value, or `undefined` before it loaded.  |
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
        `page ${page.pageObjectNumber} is not in this document`,
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

## Overlays

An overlay entry is a local change the engine has not confirmed yet. It lives
in session state, next to (never inside) the mirror, and reads combine the
two. The rules:

- **One entry per write, holding what that write carries.** A record's new
  flags, its new geometry, its typed text: each is its own entry, so settling
  one write never touches other outstanding work on the same record.
- **Keyed by the record, following it.** When a record gets another key (a new
  record confirmed under the engine's key, a weak record the engine named),
  its entries move with it. A new record has no key until the engine answers,
  so its create carries one the confirmation carries too, chosen before the
  engine call; a write to a record that does not exist in the engine yet waits
  for its create.
- **Refused: dropped at once.** The change is wrong; the reads show the
  mirror, including anything another session changed meanwhile. Rollback is
  deletion; nothing is restored from a copy.
- **Accepted: dropped once the mirror holds it**, and only after every older
  entry of the same record settled, so the view never falls back to an older
  version of what the user did. The engine publishes before it resolves, so an
  exactly folded event is in the mirror already; an event that asked for a
  page read is in once that read succeeded. While the mirror is stale (a read
  failed), accepted entries stay: the engine accepted them.

The annotation plugin is the reference
(`packages/plugin/annotation/README.md`): `services/intents.ts` stages a
message's changes and settles them, `model.ts` holds the transitions
(`stage`, `writeSettled`, `followRecord`), and `services/record-identity.ts`
is the one place a record changes its key: it matches new records to their
confirmation by `/NM`, notices weak records the engine named, and moves
everything keyed by the record, including what other areas keep per record.

A write that shows no value before it is confirmed needs no overlay. An in-flight flag in
session state is enough: the form plugin marks a field in `writing` for the
duration of its write (`beginWrite` / `endWrite` in
`packages/plugin/form/src/model.ts`), and a reload never touches that flag.

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
    publishInvalidation(change.pages, change.scope, 'origin' in event ? originOf(event) : null);
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
   the event does not carry enough (`form.repaired`, or `redaction.applied`
   for annotations).
4. Verbs call the engine and return. They do not refetch, do not wait for
   revisions, and do not emit fact events.
5. A verb's `await` sees its own write. Both engines publish the event for a
   session's own mutation before the mutation's promise settles, so the fold
   and the fact events have run by the time the verb resumes.
6. Fact events come from `changed` (or from the plugin's one listener for that
   event) with `originOf(event)`. Loads announce `onResynced`.
7. Reactions subscribe with `ctx.listen` in `connect`.
8. `refresh()` exists for recovery and for callers that want a fresh read. No
   write path calls it.

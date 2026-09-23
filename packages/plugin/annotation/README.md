# @embedpdf/plugin-annotation

The annotation plugin: drawing, selecting, moving, restyling, typing into and
deleting annotations, over a document the engine owns. It wires the pure
[`@embedpdf/core-annotation`](../../core/annotation/README.md) to the engine
and to the interaction hub. It has no framework code; the adapters render its
reads.

## Three kinds of data, one owner each

What the user sees is built from three kinds of data. Each has exactly one
owner, and nothing else writes it.

| Data          | What it is                                                                 | Owner                                      | Changed by                                                                    |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| **confirmed** | every annotation record the engine confirmed, with its appearance version  | the records mirror (`sync/records.ts`)     | confirmed document events, from any session, and loads                        |
| **pending**   | changes the user made that the engine has not confirmed yet, one per write | `pending` in the plugin state (`model.ts`) | a user action stages them; each is dropped when its write settles (see below) |
| **session**   | selection, hover, the gesture in progress, text editing, tool settings     | `session` in the plugin state              | the core's `update`                                                           |

The **view** (`read/view.ts`) combines them: confirmed records with the
pending changes laid on top, composed with the session into the core's
`Model`. Every read and every gesture takes that model. It is memoized per
record, so a change to one record does not recompute the others.

## The life of one change

A user drags a square to a new place:

```
 pointer up
    │
    ▼
 store.commit({ type: 'editPointer', phase: 'up', … })          services/store.ts
    │
    ├─ update(model, message)                                   core-annotation
    │     → session   (the drag is over)
    │     → change    (put: the square at its new place)
    │     → effects   ([{ type: 'patch', id: 'obj:12', scope: geometry }])
    │
    ├─ intents.begin(model, result)                             services/intents.ts
    │     the session and a pending change for obj:12 (its new geometry)
    │     enter the state: the view shows the square at its new place at once
    │
    ├─ effect runners                                           write/runners.ts
    │     patch → page.annotations.update(ref, geometry patch)
    │
    └─ intents.run(writes)
          the engine applies the write and publishes `annotation.updated`
          before its promise resolves:
            records mirror folds it   → confirmed obj:12 is at the new place
          the write settles:
            the pending change is dropped → the view shows the confirmed record
```

A pending change holds exactly what its write carries (here: the geometry),
so other outstanding work on the same record (typed text waiting for its
write, say) is untouched when it settles. The rules:

- **Refused** (a revoked grant, a lock set elsewhere): the change is dropped
  at once and the view shows the confirmed record, including anything another
  session changed meanwhile. Nothing has to be undone by hand, and
  `onWriteFailed` tells the UI why.
- **Accepted**: the change is dropped once the records mirror holds the result
  and every older change of the same record has settled, so the view never
  falls back to an older version of what the user did. If the mirror is stale
  (a page read failed), the change stays until a load succeeds.

The same pipeline carries every kind of change:

- **New annotations** show under a `new:<n>` id. The create carries a fresh
  `/NM` (`write/named.ts`); when the confirmed record comes back with it,
  `sync/confirmed.ts` moves the selection, the text editing and the record's
  other pending changes to the real key (`services/new-records.ts`,
  `followRecord`). An edit or a delete made before that is written once the
  create is, against the real key (`newRecords.withRef`).
- **Deletes** stage a `delete` change: the record disappears at once, and
  comes back if the engine refuses.
- **Typing** stages a change per keystroke. The `text` effect waits for a
  pause, then writes the latest text once (`write/text-editing.ts`). An older
  write's echo cannot replace newer typing: a write only settles its own
  changes.
- **Weak annotations** (direct objects without `/NM`, addressed by position)
  that the engine names keep their pending changes and selection under the
  new key (`renamesBetween` in `services/store.ts`).
- **Programmatic verbs** that show nothing before the engine answers
  (`update`, `delete`, `createRaw`) write straight to the engine; the mirror
  shows their result before they resolve.

## How a record renders

A confirmed record renders from the engine's appearance raster (`baked`)
unless this session edited or created it, in which case it renders live from
its description (`vector`): the `vector` preference in the state. Another
session's change hands the record back to the raster (`sync/confirmed.ts`).
Stamps and widgets have no live rendering and always use the raster. The
raster is fetched again exactly when the record's appearance version changes,
which the mirror advances when the engine reports a re-baked appearance.

## Where things live

| Folder          | What is in it                                                                         |
| --------------- | ------------------------------------------------------------------------------------- |
| `controller.ts` | the composition root: builds the services, wires every area, assembles the capability |
| `model.ts`      | the plugin state and its transitions (`stage`, `settle`, `confirmCreate`, …)          |
| `services/`     | what every area is built on: the store, intents, new records, events, authority       |
| `sync/`         | the records mirror and what follows a confirmed change                                |
| `read/`         | the view, and the reads the capability exposes (annotations, render items, chrome)    |
| `write/`        | the verbs, and the effect runners that turn core effects into engine writes           |
| `repository/`   | engine DTO ↔ content-space record, one projection per annotation kind                 |
| `comments/`     | the comment threads lens over the same records                                        |
| `tools/`        | tool definitions, the registry, and the pointer handlers on the interaction hub       |

## Tests

`test/harness.ts` runs the controller on the kernel's test context with a
fake engine that behaves like the real ones: every write publishes its
confirmed event before its promise resolves, and every create must carry an
`/NM`. `test/intents.test.ts` is the place to start: what the user sees
while, and after, a write runs. `test/interleavings.test.ts` plays seeded
random sequences of changes, refusals, remote updates and out-of-order
answers, and checks the view after every step.

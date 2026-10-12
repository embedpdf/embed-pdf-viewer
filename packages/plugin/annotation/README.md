# @embedpdf/plugin-annotation

The annotation plugin: drawing, selecting, moving, restyling, typing into and
deleting annotations, over a document the engine owns. It wires the pure
[`@embedpdf/core-annotation`](../../core/annotation/README.md) to the engine
and to the interaction hub. It has no framework code; the adapters render its
reads.

## Three kinds of data, one owner each

What the user sees is built from three kinds of data. Each has exactly one
owner, and nothing else writes it.

| Data          | What it is                                                                                                      | Owner                                                   | Changed by                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| **confirmed** | every annotation record the engine confirmed, with its appearance version                                       | the records mirror (`sync/records.ts`), `records.get()` | confirmed document events, from any session, and loads       |
| **pending**   | this session's changes the engine hasn't answered yet, one per user action                                      | the kernel's change queue (`ctx.changes`)               | a user action stages one; it leaves once the engine answered |
| **session**   | selection, hover, the gesture in progress, text editing, tool settings, the object numbers held for new records | `session` in the plugin state (`model.ts`)              | the core's `update`                                          |

The records mirror shows the pending changes on top of what the engine
confirmed (`records.view()`): it replays them, op by op, through
`predictRecords`, the same rules the engine applies. The **view**
(`read/view.ts`) turns those records into the core's records, each drawn as
the change on it says, and composes them with the session into the core's
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
    │     → effects   ([{ type: 'patch', id: 'obj:12', patch: { box } }])
    │
    ├─ op builders                                              write/ops.ts
    │     patch → { type: 'annotations.update', ref, patch }
    │     (an annotation's link children follow it: write/links.ts)
    │
    └─ ctx.changes.stage({ label, ops, undo })                  the kernel
          the records mirror predicts it: the view shows the square at its
          new place at once. The queue sends it after everything staged
          before it; the engine applies it, all or nothing, and publishes
          `annotations.updated` before it answers:
            the records mirror folds it → confirmed obj:12 is at the new place
          the change leaves the view → the view shows the confirmed record
```

One user action is one change: moving five annotations is one change of five
ops, one request, one undo step. The rules:

- **Refused** (a revoked grant, a lock set elsewhere): the change leaves the
  view at once, and the view shows the confirmed record, including anything
  another session changed meanwhile. Nothing has to be undone by hand, and
  `onWriteFailed` tells the UI why. A change that names a record only a
  refused change would have created is refused with it.
- **Applied**: the change leaves the view once the records mirror holds the
  answer, which is at once when its events folded; if a fold asked to read a
  page again, the view keeps it until that read lands.
- **In order**: the engine answers changes in the order they were staged, so
  a newer change always shows over an older one's answer.

The same pipeline carries every kind of change:

- **New annotations** take an object number the session holds
  (`services/object-numbers.ts`), so a new record has its final ref from its
  first frame: it can be selected, edited, linked or deleted at once, and
  each of those is simply staged after its create. A replace-text caret and
  its strikeout are two creates in one change, the strikeout answering the
  caret by its number. Should the document's pool be empty for a moment, the
  create waits for numbers (the drawing stays on screen).
- **Deletes**: the record and what goes with it (its replies, grouped parts,
  popups) leave the view at once, and come back if the engine refuses.
- **Typing** goes into one held change per pause (`write/text-editing.ts`):
  every keystroke amends it, so the text shows at once, and it is sent after
  a pause, when editing ends, when anything else is staged, and before a
  download. A format on the words selected while typing goes into it too.
- **Changes stated in code** (`create`, `update`, `delete`, `reorder`,
  comments, links, scripts) go through the store's second door, `apply`: each
  is checked with the engine's own functions, shown at once, and sent,
  answered and refused exactly like a gesture's. One call is one change.

## How a record renders

A confirmed record renders from the engine's appearance raster (`baked`)
unless this session edited or created it, in which case it renders live from
its description (`vector`): the `vector` preference in the state. Another
session's change hands the record back to the raster (`sync/confirmed.ts`).
While a change of this session is pending, how the record is drawn follows
from the change itself (core `drawnAfter`, the engine's verdict on it): a move
carries the raster along, anything else visible draws live, and a change the
raster already shows (a flag) leaves it as it is. Stamps and widgets have no
live rendering and always use a raster: a stamp's keeps its proportions in a
resized box (the engine fits it `contain`), and a stamp this session placed
shows the preview it was placed with until the engine's picture of it exists
(`read/render.ts`). The raster is fetched again exactly when the record's
appearance version changes, which the mirror advances when the engine reports
a re-baked appearance.

## Where things live

| Folder          | What is in it                                                                         |
| --------------- | ------------------------------------------------------------------------------------- |
| `controller.ts` | the composition root: builds the services, wires every area, assembles the capability |
| `model.ts`      | the plugin state and its transitions (`withSession`, render preferences, …)           |
| `services/`     | what every area is built on: the store, object numbers, events, authority             |
| `sync/`         | the records mirror (what the engine confirmed, and its prediction) and what follows   |
| `read/`         | the view, and the reads the capability exposes (annotations, render items, chrome)    |
| `write/`        | the verbs, and the op builders that turn core effects into the engine's ops           |
| `comments/`     | the comment threads lens over the same records                                        |
| `tools/`        | tool definitions, the registry, the tool's ghost, and the pointer handlers on the hub |

## Tests

`test/harness.ts` runs the controller on the kernel's test context with a
fake engine that behaves like the real ones: it applies one change at a time,
in the order they were sent, all or nothing, and publishes its events before
it answers; a create gets the object number it names. `test/pending.test.ts`
is the place to start: what the user sees while, and after, a change is on
its way. `test/interleavings.test.ts` plays seeded random sequences of
changes, refusals and remote updates, and checks the view (values and how
the record renders) after every step.

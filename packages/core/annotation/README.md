# @embedpdf/core-annotation

The pure annotation core: gestures, geometry, hit-testing and the scene, as
plain functions. No DOM, no engine, no framework, no clock. The annotation
plugin ([`@embedpdf/plugin-annotation`](../../plugin/annotation/README.md))
runs it against the engine.

## The contract

```ts
update(model: Model, message: Message): UpdateResult;

interface UpdateResult {
  session: Session; // selection, hover, the gesture in progress, tool settings
  change: ChangeSet; // { put: records the message changed or created, drop: ids it deleted }
  effects: Effect[]; // the engine work to do: create, patch, flags, text, delete, …
}

type Model = Session & AnnotationView; // AnnotationView = { byId, order }
```

A message goes in with the model it acts on; the next session, the records it
changed and the work to do come out. The core never stores a record: the
records in `model.byId` are what the plugin shows (the engine's records with
the user's pending changes on top), and the change set says what this message
changed about them. The plugin decides where those changes live and when they
are dropped.

Consequences worth knowing:

- A message that changes no record returns `EMPTY_CHANGE`, and a pointer move
  during a drag changes only the session (the gesture's `draft`), so it costs
  one comparison.
- Records the core creates get the id `new:<n>` from the session's `seq`. When
  the engine confirms one under its real key, the plugin sends `rekey` so the
  selection, hover and text editing follow it; when records leave the view, it
  sends `forget`.
- The core decides _how_ an edit renders (`source: 'vector'` once a resize or
  restyle makes the engine's raster stale; a move keeps the raster), never
  _whether_ the engine's re-baked raster changed: that is the engine's answer.

## Where each message is handled

`src/update/` holds one module per kind of work. `update/index.ts` is the
entry and the message switch.

| Module               | Messages                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| `edit.ts`            | `editPointer` down and move: select, move, resize, rotate, caption, leader |
| `edit-commit.ts`     | `editPointer` up: the gesture's result becomes the records' geometry       |
| `marquee.ts`         | `marqueePointer`: rubber-band selection                                    |
| `draw.ts`            | `createPointer`, `finishInkDraft`, `finishCreationDraft`                   |
| `draw-callout.ts`    | the free-text callout gesture                                              |
| `draw-distance.ts`   | the distance measurement gesture                                           |
| `text-markup.ts`     | `createMarkup`, `createCaret`, `createReplaceText`, the markup preview     |
| `create.ts`          | `createAnnot`: creation from the API                                       |
| `selection-edits.ts` | `setProps`, `setFlags`, `rotate90`, `resetRotation`, `delete`              |
| `text.ts`            | `setText`, `setRichText`                                                   |
| `session.ts`         | the initial session, tool defaults, `rekey`, `forget`                      |
| `changes.ts`         | what every record-changing transition shares                               |
| `page-bound.ts`      | keeping gestures inside the page they started on                           |

The reads (`view.ts`, `hit.ts`, `scene.ts`, `geometry.ts`, …) take the same
`Model` and never change it.

## Tests

`test/support.ts` drives the core the way the plugin does: `modelWith(records)`
builds a model, and `step(model, message)` applies a message's result (its
session, and its change set on the records).

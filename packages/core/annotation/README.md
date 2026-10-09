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
this session's pending changes on top), and the change set says what this
message changed about them. The plugin turns the effects into one change for
the engine, which it shows until the engine answers.

Consequences worth knowing:

- A message that changes no record returns `EMPTY_CHANGE`, and a pointer move
  during a drag changes only the session (the gesture's `draft`), so it costs
  one comparison.
- A record the core creates takes the first object number the session holds
  (`Session.objectNumbers`): its ref, and so its key, is final from its first
  frame, and it is marked `unconfirmed` until the engine wrote it. The plugin
  hands the session the numbers a message may need before it runs
  (`newRecordsAtMost`); the core refuses to make a record it can't name. A
  replace-text strikeout answers its caret by the caret's number, so both are
  written in one change. When records leave the view, the plugin sends
  `forget`.
- How a record is drawn after a change is one rule, in `src/appearance.ts`,
  for gestures, sidebar edits and code edits alike: a move keeps the raster
  and moves it, any other visible change draws live, and stamps and form
  widgets always show their raster (a stamp's at its own proportions, as the
  engine fits it `contain`). It asks the engine's own verdict
  (`appearanceChangeOf`), so the view keeps an appearance exactly where the
  engine does. Whether the engine's re-baked raster changed is the engine's
  answer, never the core's.

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
| `selection-edits.ts` | `setFields`, `setFlags`, `rotateSelection`, `resetRotation`, `delete`      |
| `text.ts`            | `setText`, `setRichText`                                                   |
| `session.ts`         | the initial session, tool defaults, `forget`                               |
| `changes.ts`         | what every record-changing transition shares                               |
| `page-bound.ts`      | keeping gestures inside the page they started on                           |

The reads (`view.ts`, `hit.ts`, `scene.ts`, `geometry.ts`, …) take the same
`Model` and never change it.

## What a create gesture makes

A create tool answers one question: if the gesture ended now, what would
exist? `placement.ts` answers where: `gesturePlacement` gives the dragged box
or segment once the gesture is a drag, else the tool's click default
(`resolveClickPlacement`: its size, and which part lands on the click). Each
shape family answers what (`ShapeFamily.placed`, through `placedShape`): a
box, a circle, a text box, a line with the tool's endings, a round radio
button. The commit (`draw.ts`), the drawing in progress (`view.ts`) and the
tool's ghost (the plugin's `tools/ghost.ts`) make these same calls, and
`unmadeItem` paints an annotation not made yet as the made one will paint.

## Tests

`test/support.ts` drives the core the way the plugin does: `modelWith(records)`
builds a model, and `step(model, message)` applies a message's result (its
session, and its change set on the records).

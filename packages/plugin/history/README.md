# @embedpdf/plugin-history

Undo and redo for EmbedPDF, one history per open document, of what you
change through the viewer: moving, restyling, deleting or typing into
annotations, and every other change a plugin makes.

An action shows undone at once, even while it is still on its way to the
engine. The engine undoes a change by reference: it keeps a record of what
each change did, so the history keeps no copy of the document, and a part
someone else changed since is left alone.

## Setup

```tsx
import { annotationPlugin } from '@embedpdf/react/annotation';
import { historyPlugin } from '@embedpdf/react/history';

const plugins = [
  // ...stage, interaction, selection...
  annotationPlugin(),
  historyPlugin(), // { limit: 100 } steps by default
];
```

No dependencies: it records the changes every plugin stages on the
document's change queue.

## Undo and redo

```tsx
import { useHistory, useHistoryState } from '@embedpdf/react/history';

const history = useHistory();
const { canUndo, canRedo, undoLabel } = useHistoryState();

<button disabled={!canUndo} onClick={() => history.undo()}>
  Undo
</button>;
```

- **A step is one action:** moving three annotations is one step, and so are
  the pauses of one typing session in one text box.
- **Labels are data:** `undoLabel` is `{ key: 'annotation.move', count: 3 }`,
  for your own translation ("Undo move of 3 annotations").
- **The selection follows:** after an undo, what was selected before the
  action is selected again, as far as it still shows.

## When the engine answers

| What happens                                    | The history                                                                                                   |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| An undo or redo applied                         | `onUndone({ label, redo, skipped })`; `skipped` counts the parts someone changed since, which were left alone |
| The engine refused an action                    | The action leaves the history; an undo of it already on its way says nothing                                  |
| The engine refused an undo or redo              | `onUndoFailed({ reason: 'refused', error })`, and the step goes back: it can be tried again                   |
| It can't be undone any more                     | `onUndoFailed({ reason: 'unavailable' })`, and the step goes, with everything before it                       |
| A redaction, flattening, signing or form repair | Both stacks clear: nothing before it can be undone                                                            |
| A new version of the document                   | Both stacks clear                                                                                             |
| Someone else changes the document               | Nothing: their changes aren't in your history, and the engine leaves alone what they changed since            |

## For plugin authors

The history records what a plugin stages with `ctx.changes`. Give each change
an `undo` (what undoing it looks like), so an undo is drawn before the engine
answers; `history: false` keeps a change out; holds that make up one step pass
one `merge` key. The rules are in `docs/conventions/state-and-sync.md`.

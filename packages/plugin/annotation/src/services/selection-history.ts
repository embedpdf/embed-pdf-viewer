/**
 * The selection follows undo and redo. Each change the store stages keeps
 * the selection from before and after it. When a change that undoes it is
 * staged (by the history, or by any code), the selection goes back to what it
 * was before, as far as those records still show; the undo keeps the pair the
 * other way round, so undoing the undo (a redo) brings back what it was after.
 * This works because a record's key never changes.
 */
import type { Id, Message, Model } from '@embedpdf/core-annotation';

import type { AnnotationContext } from './context';

/** How many changes keep their selections: the history keeps fewer steps than this. */
const KEPT = 200;

interface Selections {
  readonly before: readonly Id[];
  readonly after: readonly Id[];
}

export function createSelectionHistory(
  ctx: Pick<AnnotationContext, 'changes'>,
  store: { model(): Model; commit(message: Message): unknown },
) {
  /** The selections around each change, by its `opId`, oldest first. */
  const kept = new Map<string, Selections>();

  /** Keep the selection from before and after the change `opId`. */
  const remember = (opId: string, before: readonly Id[], after: readonly Id[]): void => {
    kept.set(opId, { before, after });
    if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
  };

  ctx.changes.onStaged((change) => {
    if (change.undoOf === null) return;
    const undone = kept.get(change.undoOf);
    if (!undone) return;
    remember(change.opId, undone.after, undone.before);
    // The undo shows already: select what of the earlier selection still shows.
    const model = store.model();
    const ids = undone.before.filter((id) => id in model.byId);
    store.commit(ids.length ? { type: 'select', ids } : { type: 'deselect' });
  });

  return { remember };
}

export type SelectionHistory = ReturnType<typeof createSelectionHistory>;

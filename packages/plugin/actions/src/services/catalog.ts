/**
 * The ONE catalog-actions read (D11). The catalog /AA is immutable in-session
 * (no writer exists in the stack), so the open sequence, boot sources and
 * the five document events share one memoized read; a REJECTED read is
 * evicted so a transient failure cannot poison every future lifecycle event.
 */
import type { DocumentActionsSnapshot } from '@embedpdf/engine-core/runtime';

import type { ActionsContext } from './context';

export function createCatalog(ctx: ActionsContext) {
  let actionsSnapshotPromise: Promise<DocumentActionsSnapshot | null> | null = null;
  const readDocumentActions = (): Promise<DocumentActionsSnapshot | null> => {
    if (!actionsSnapshotPromise) {
      const doc = ctx.doc;
      const read: Promise<DocumentActionsSnapshot | null> = doc?.actions
        ? Promise.resolve(doc.actions.read())
        : Promise.resolve(null);
      const memo: Promise<DocumentActionsSnapshot | null> = read.catch((error: unknown) => {
        if (actionsSnapshotPromise === memo) actionsSnapshotPromise = null;
        throw error;
      });
      actionsSnapshotPromise = memo;
    }
    return actionsSnapshotPromise;
  };

  /** The Table-200 key for each verb-shaped document trigger event. */
  const DOC_EVENT_TREES = {
    'will-save': 'willSave',
    'did-save': 'didSave',
    'will-print': 'willPrint',
    'did-print': 'didPrint',
    'will-close': 'willClose',
  } as const;
  return { readDocumentActions, DOC_EVENT_TREES };
}
export type ActionsCatalog = ReturnType<typeof createCatalog>;

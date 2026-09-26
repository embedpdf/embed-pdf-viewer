/**
 * The one catalog-actions read. The catalog /AA is immutable in a session (no
 * writer exists in the stack), so the open sequence, the boot sources and the
 * five document events share one memoized read; a rejected read is evicted,
 * so a transient failure cannot poison every later lifecycle event.
 */
import type { PluginContext } from '@embedpdf/core';
import type { DocumentActionsSnapshot } from '@embedpdf/engine-core/runtime';

/** The ISO 32000-2 Table 200 key for each verb-shaped document trigger event. */
const DOC_EVENT_TREES = {
  'will-save': 'willSave',
  'did-save': 'didSave',
  'will-print': 'willPrint',
  'did-print': 'didPrint',
  'will-close': 'willClose',
} as const;

export function createCatalog(ctx: PluginContext<void>) {
  let snapshotRead: Promise<DocumentActionsSnapshot | null> | null = null;
  const readDocumentActions = (): Promise<DocumentActionsSnapshot | null> => {
    if (!snapshotRead) {
      const service = ctx.doc.actions;
      const read: Promise<DocumentActionsSnapshot | null> = service
        ? Promise.resolve(service.get())
        : Promise.resolve(null);
      const memoized: Promise<DocumentActionsSnapshot | null> = read.catch((error: unknown) => {
        if (snapshotRead === memoized) snapshotRead = null;
        throw error;
      });
      snapshotRead = memoized;
    }
    return snapshotRead;
  };
  return { readDocumentActions, DOC_EVENT_TREES };
}
export type ActionsCatalog = ReturnType<typeof createCatalog>;

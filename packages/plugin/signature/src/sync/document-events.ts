/** Live facts: parked signings, new versions, remote signings, and the
 *  edits that make a re-judgement due. */
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';

import type { SignatureContext } from '../services';
import type { SignatureHydration } from './hydration';

export function subscribeDocumentEvents(
  ctx: SignatureContext,
  {
    refresh,
    validate,
    revalidateSoon,
  }: Pick<SignatureHydration, 'refresh' | 'validate' | 'revalidateSoon'>,
): void {
  const doc = ctx.doc;
  if (!doc) return;
  const unsubscribe = doc.events.subscribe((event: DocumentEvent) => {
    switch (event.type) {
      case 'signature.prepared':
        ctx.dispatch({
          type: 'PENDING',
          pending: { signingId: event.signingId, field: event.field },
        });
        return;
      case 'signature.aborted':
        ctx.dispatch({ type: 'PENDING', pending: null });
        return;
      case 'signature.completed':
        ctx.dispatch({ type: 'PENDING', pending: null });
        return;
      case 'document.versioned':
      case 'stream.desynced':
        // Byte-level facts moved: re-read them and re-judge.
        void refresh()
          .then(() => validate())
          .catch((error) => globalThis.console?.error('[signature] refresh failed:', error));
        return;
      case 'form.fieldCreated':
      case 'form.fieldDeleted':
      case 'form.widgetAttached':
      case 'form.widgetDetached':
      case 'form.imported':
      case 'form.repaired':
        // The field set changed (a signature field authored or removed, here
        // or remotely): the snapshot lists fields, so re-read it — and the
        // change is a modification of the working copy, so re-judge.
        void refresh()
          .then(() => revalidateSoon())
          .catch((error) => globalThis.console?.error('[signature] refresh failed:', error));
        return;
      case 'annotation.created':
      case 'annotation.updated':
      case 'annotation.deleted':
      case 'annotation.moved':
      case 'form.valueChanged':
      case 'form.fieldUpdated':
      case 'form.effectsApplied':
        // An edit of the working copy: what a save would write changed, so
        // what a validator would say about it may have too.
        revalidateSoon();
        return;
      default:
        return;
    }
  });
  ctx.cleanup(unsubscribe);
}

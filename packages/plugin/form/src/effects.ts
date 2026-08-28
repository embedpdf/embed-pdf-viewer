/**
 * Makes the form REACTIVE beyond this session's own writes — the same
 * pattern the metadata and annotation plugins use.
 *
 * Own value writes flow through the capability (writeDone patches one
 * field). This effect folds in everything else: remote collaborators'
 * `form.*` events (SSE on cloud), and structural events that can move or
 * add widgets (field created/deleted, repair) — those also invalidate the
 * cached widget geometry, because the widget PLANE changed.
 */
import type { DocumentEvent, EffectContext } from '@embedpdf/core';

import { update } from './core/model';
import type { FormAction, FormState } from './types';

const STRUCTURAL = new Set<DocumentEvent['type']>([
  'form.fieldCreated',
  'form.fieldUpdated',
  'form.fieldDeleted',
  'form.widgetAttached',
  'form.widgetDetached',
  'form.repaired',
]);

export function registerFormEffects(ctx: EffectContext<FormState, FormAction>): void {
  const doc = ctx.doc;
  if (!doc) return;

  let refreshing = false;
  const refresh = async (): Promise<void> => {
    if (refreshing) return;
    refreshing = true;
    try {
      const snapshot = await doc.forms.list();
      ctx.dispatch({
        type: 'SET_MODEL',
        model: update(ctx.getState().model, { t: 'snapshot', snapshot }),
      });
    } finally {
      refreshing = false;
    }
  };

  const unsubscribe = doc.events.subscribe((event) => {
    // The live stream fell too far behind to replay: the gap's form events
    // will never arrive, so the snapshot in the model may be stale. This
    // plugin reconciles by REFETCH (not incremental merge), so the desync
    // notice is the only extra signal it needs — re-read the whole (cheap)
    // snapshot.
    if (event.type === 'stream.desynced') {
      void refresh();
      return;
    }
    if (!event.type.startsWith('form.') || !('origin' in event)) return;
    const structural = STRUCTURAL.has(event.type);
    // Own non-structural writes already landed via the capability.
    if (event.origin.kind !== 'remote' && !structural) return;
    if (structural) {
      ctx.dispatch({
        type: 'SET_MODEL',
        model: update(ctx.getState().model, { t: 'clearGeom' }),
      });
    }
    void refresh();
  });
  ctx.cleanup(unsubscribe);
}

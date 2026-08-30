/**
 * Makes annotations REACTIVE to the document event stream.
 *
 * Own edits already update the model through the capability's promise path
 * (optimistic draw + re-sync from the engine DTO). This effect wires in
 * everything else:
 *
 *   - it kicks whole-document hydration exactly once (`ensureHydrated`);
 *   - remote `annotation.*` events are handed to the capability's
 *     hydration-aware delivery (queued + cursor-replayed during the
 *     hydration window, applied live otherwise);
 *   - `stream.desynced` re-runs hydration — the gap's mutations will never
 *     arrive as events;
 *   - remote page inserts/deletes reconcile the model's page membership;
 *   - form and redaction cross-plane events invalidate exactly what they
 *     touched, as before.
 */
import type { DocumentEvent, EffectContext } from '@embedpdf/core';
import { encodeStableIdKey } from '@embedpdf/engine-core/runtime';
import { update, type Msg } from '@embedpdf/core-annotation';

import { AnnotationToken } from './types';
import type { AnnotationAction, AnnotationState } from './types';

export function registerAnnotationEffects(
  ctx: EffectContext<AnnotationState, AnnotationAction>,
): void {
  const doc = ctx.doc;
  if (!doc) return;

  const host = () => ctx.get(AnnotationToken);

  const apply = (msg: Msg): void => {
    const [next] = update(ctx.getState().model, msg);
    ctx.dispatch({ type: 'SET_MODEL', model: next });
  };

  // Subscribe FIRST, then hydrate: the coherence protocol needs every event
  // from the snapshot's cursor onward to be observed (queued or applied) —
  // a gap between snapshot and stream is exactly the resurrection bug.
  const unsubscribe = doc.events.subscribe((event: DocumentEvent) => {
    // Widget appearances are re-baked by FORM value writes — a plane this
    // plugin doesn't own, so no remote-only filter: direct fills emit
    // `form.valueChanged`, while scripted batches emit `form.effectsApplied`.
    // Neither path touches this model directly. The bump tells the render
    // layer to re-fetch exactly the repainted widgets' rasters.
    if (event.type === 'form.valueChanged' || event.type === 'form.effectsApplied') {
      apply({
        t: 'bumpAp',
        ids: event.changedWidgets
          .filter((w) => w.annotObjectNumber > 0)
          .map((w) => encodeStableIdKey({ kind: 'objectNumber', value: w.annotObjectNumber })),
      });
      return;
    }
    // A redaction apply deleted the consumed marks plus every intersecting
    // annotation on the applied pages. ORIGIN-AGNOSTIC: our own applies run
    // through the redaction plugin's doc-level verb, never this plane's
    // capability paths, so the model is stale either way — reload the
    // affected pages from the engine. (Works without plugin-redaction
    // installed: a remote collaborator's apply still reconciles this view.)
    if (event.type === 'redaction.applied') {
      const affected = new Set(
        event.results.filter((r) => r.status === 'applied').map((r) => r.pageObjectNumber),
      );
      if (affected.size) {
        for (const pon of affected) void host().reloadPage(pon);
      }
      return;
    }
    // The live stream fell too far behind to replay — the gap's mutations
    // will NEVER arrive as events, so re-read the whole document.
    if (event.type === 'stream.desynced') {
      void host().rehydrate();
      return;
    }
    // Page membership changed. ORIGIN-AGNOSTIC like redaction: removing a
    // deleted page's annotations twice is a no-op, and reloading an
    // inserted page merges idempotently — correct whether the op was ours
    // or a collaborator's.
    if (event.type === 'pages.deleted') {
      const gone = new Set<number>(event.pageObjectNumbers);
      const m = ctx.getState().model;
      const ids = m.order.filter((id) => {
        const a = m.byId[id];
        return a !== undefined && gone.has(a.pon);
      });
      if (ids.length) apply({ t: 'remove', ids });
      return;
    }
    if (event.type === 'pages.inserted') {
      // A fresh page usually has no annotations, but an insert-from-bytes
      // can carry them. `reloadPage` no-ops harmlessly if the layout for
      // the new page hasn't landed in core state yet (crop unknown).
      for (const pon of event.insertedPageObjectNumbers) void host().reloadPage(pon);
      return;
    }
    // Only fold in OTHER sessions' edits; our own flow through the capability.
    if (!('origin' in event) || event.origin.kind !== 'remote') return;
    switch (event.type) {
      case 'annotation.created':
      case 'annotation.updated':
      case 'annotation.moved':
      case 'annotation.deleted':
        host().deliverRemoteAnnotationEvent(event);
        break;
      default:
        break;
    }
  });
  ctx.cleanup(unsubscribe);

  host().ensureHydrated();
}

/**
 * Makes annotations REACTIVE to remote collaborators — the same pattern the
 * metadata plugin uses for the Info dict.
 *
 * Own edits already update the model through the capability's promise path
 * (optimistic draw + re-sync from the engine DTO). This effect folds in the
 * edits that DIDN'T originate here: it subscribes to the document event stream
 * and applies `annotation.*` events whose `origin.kind === 'remote'` — another
 * session's create/update/move/delete, delivered over SSE on cloud. Filtering
 * to remote avoids double-applying (and racing the temp-id reconcile of) our
 * own echoes.
 */
import type { DocumentEvent, EffectContext } from '@embedpdf-x/kernel';
import { encodeStableIdKey } from '@embedpdf/engine-core/runtime';
import { propsFor, update, type Annot, type Msg } from '@embedpdf-x/annotation-core';

import { fromDTO, refKey } from './repository';
import { AnnotationToken } from './types';
import type { AnnotationAction, AnnotationState } from './types';

export function registerAnnotationEffects(
  ctx: EffectContext<AnnotationState, AnnotationAction>,
): void {
  const doc = ctx.doc;
  if (!doc) return;

  const cropOf = (pon: number) =>
    ctx.document()?.pages.find((p) => p.pageObjectNumber === pon)?.boxes.crop ?? null;

  const apply = (msg: Msg): void => {
    const [next] = update(ctx.getState().model, msg);
    ctx.dispatch({ type: 'SET_MODEL', model: next });
  };

  const upsert = (dtos: ReadonlyArray<Parameters<typeof fromDTO>[0]>): void => {
    const annots: Annot[] = [];
    for (const dto of dtos) {
      const crop = cropOf(dto.pageObjectNumber);
      if (!crop) continue;
      // Another session authored this — trust the engine's baked AP.
      const a = fromDTO(dto, crop, 'baked');
      // A remote ATTACHED-link child (grouped /Link under a linkable local
      // parent) folds onto the parent instead of entering the model — the
      // same rule the page-load fold applies (see foldAttachedLinks).
      if (a.subtype === 'link' && a.data?.subtype === 'link' && a.data.replyType === 'group') {
        const parentId = a.data.inReplyTo ? refKey(a.data.inReplyTo) : null;
        const parent = parentId ? ctx.getState().model.byId[parentId] : null;
        if (
          parent &&
          parent.subtype !== 'link' &&
          propsFor(parent.subtype).some((s) => s.key === 'link') &&
          a.ref
        ) {
          const refs = parent.linkRefs ?? [];
          const known = refs.some((r) => refKey(r) === a.id);
          annots.push({
            ...parent,
            link: a.data.target,
            linkRefs: known ? refs : [...refs, a.ref],
          });
          continue;
        }
      }
      annots.push(a);
    }
    // A remote edit may have re-baked the /AP (only the resulting DTO is
    // visible here, not what changed) — advance `apVersion` so the raster
    // refreshes rather than trusting a stale local render.
    if (annots.length) apply({ t: 'upsert', annots, bumpAp: true });
  };

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
        const host = ctx.get(AnnotationToken);
        for (const pon of affected) void host.reloadPage(pon);
      }
      return;
    }
    // Only fold in OTHER sessions' edits; our own flow through the capability.
    if (!('origin' in event) || event.origin.kind !== 'remote') return;
    switch (event.type) {
      case 'annotation.created':
        upsert([event.created]);
        break;
      case 'annotation.updated':
        upsert([event.updated]);
        break;
      case 'annotation.moved':
        upsert(event.moved);
        break;
      case 'annotation.deleted':
        if (event.deleted) {
          const key = encodeStableIdKey(event.deleted);
          const m = ctx.getState().model;
          if (m.byId[key]) {
            apply({ t: 'remove', ids: [key] });
          } else {
            // Not in the model → possibly a folded ATTACHED-link child a
            // remote session deleted: prune it from its parent's join keys
            // (clearing the parent's link value with the last child).
            for (const id of m.order) {
              const a = m.byId[id];
              const refs = a?.linkRefs;
              if (!a || !refs?.length || !refs.some((r) => refKey(r) === key)) continue;
              const remaining = refs.filter((r) => refKey(r) !== key);
              apply({
                t: 'upsert',
                annots: [
                  { ...a, linkRefs: remaining, ...(remaining.length ? {} : { link: null }) },
                ],
              });
              break;
            }
          }
        }
        break;
      default:
        break;
    }
  });
  ctx.cleanup(unsubscribe);
}

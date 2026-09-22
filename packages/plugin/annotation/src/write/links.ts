import {
  contentToPdfRect,
  linkChildrenOf,
  linkOf,
  type ModelAnnotation,
  type Id,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import { linkChildRects, writableTarget } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';

/**
 * Attached links (a Link child riding an editable annotation) and group
 * relationships: the one reconciler that creates, retargets, re-rects and
 * deletes link children, and the relationship-only patch grouping uses.
 */
export function createLinkWrites(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, geometry, records }: Pick<AnnotationServices, 'store' | 'geometry' | 'records'>,
) {
  /**
   * Per-parent serialization of attached-link reconciles: rapid edits chain
   * instead of interleaving (two overlapping runs could double-create
   * children). Each run reads the current model at execution time, so a
   * chained run converges on the latest desired state.
   */
  const chains = new Map<Id, Promise<void>>();

  /**
   * The one place attached link children are created, retargeted, re-rected,
   * or deleted. Declarative: desired state = `desired` target + the parent's
   * committed geometry (`linkChildRects`); current state is read straight
   * from the substrate (`linkChildrenOf`) — no join-key ledger. Results land
   * as ordinary substrate upserts/removes, so the `linkOf` lens converges
   * immediately locally and via events everywhere else. Idempotent — foreign
   * inconsistencies heal on the next local edit.
   */
  const reconcileChildren = async (id: Id, desired: PdfLinkTarget | null): Promise<void> => {
    const doc = ctx.doc;
    const annotation = store.model().byId[id];
    if (!doc || !annotation || !annotation.ref || annotation.subtype === 'link') return;
    const crop = geometry.cropOf(annotation.page.pageObjectNumber);
    if (!crop) return;
    const page = doc.page(annotation.page);
    // Read-only target arms can't be (re)written: children keep their /A and
    // only their rects follow the parent.
    const target = writableTarget(desired);
    const rects =
      desired == null ? [] : linkChildRects(annotation).map((rect) => contentToPdfRect(rect, crop));
    const current = linkChildrenOf(store.model(), id);
    try {
      const paired = Math.min(current.length, rects.length);
      for (let i = 0; i < paired; i++) {
        const ref = current[i].ref;
        if (!ref) continue;
        const result = await page.annotations.update(ref, {
          subtype: 'link',
          rect: rects[i],
          ...(target ? { target } : {}),
        });
        store.commit({ type: 'upsert', annots: [records.ingest(result.updated, crop, 'baked')] });
      }
      for (let i = current.length; i < rects.length; i++) {
        const result = await page.annotations.create({
          subtype: 'link',
          rect: rects[i],
          target,
          inReplyTo: annotation.ref,
          replyType: 'group',
        });
        store.commit({ type: 'upsert', annots: [records.ingest(result.created, crop, 'baked')] });
      }
      for (let i = rects.length; i < current.length; i++) {
        const child = current[i];
        if (child.ref) await page.annotations.delete(child.ref);
        store.commit({ type: 'remove', ids: [child.id] });
      }
    } catch (error) {
      console.error('[annotation] attached-link sync failed:', error);
    }
  };

  /**
   * Queue a reconcile. `intent` is either an explicit target (a set/clear —
   * captured by this run's closure, so chained sets stay latest-wins) or
   * `'keep'` (a geometry follow: re-rect the children toward whatever target
   * the substrate holds at run time — so a remote retarget is never undone
   * by a local move). Returns the chain, so `links.set()` can await commit.
   */
  const scheduleSync = (
    id: Id,
    intent: { target: PdfLinkTarget | null } | 'keep',
  ): Promise<void> => {
    const previous = chains.get(id) ?? Promise.resolve();
    const next = previous.then(() =>
      reconcileChildren(id, intent === 'keep' ? linkOf(store.model(), id) : intent.target),
    );
    chains.set(id, next);
    void next.finally(() => {
      if (chains.get(id) === next) chains.delete(id);
    });
    return next;
  };

  /** A relationship-only engine patch (sets/clears `/IRT` + `/RT`) — geometry and
   *  style are left untouched, so grouping never re-bakes an appearance. */
  const relationshipPatch = (
    subtype: AnnotationDTO['subtype'],
    rel: { inReplyTo: AnnotationRef | null; replyType?: 'group' },
  ): AnnotationPatch => ({ subtype, ...rel }) as AnnotationPatch;

  /** Write a relationship change to one committed annotation; the fold applies the result. */
  const writeRelationship = async (
    record: ModelAnnotation,
    relationship: { inReplyTo: AnnotationRef | null; replyType?: 'group' },
  ): Promise<void> => {
    if (!record.ref || !record.data) return;
    await ctx.doc
      .page(record.page)
      .annotations.update(record.ref, relationshipPatch(record.data.subtype, relationship));
  };

  store.onEffect('syncLink', (fx) => {
    if (!ctx.doc) return;
    void scheduleSync(fx.id, { target: fx.target });
  });

  const api = {
    links: {
      get: (ref: AnnotationRef) => {
        const model = store.model();
        const annotation = model.byId[annotationKey(ref)];
        if (!annotation) return null;
        return annotation.subtype === 'link'
          ? (annotation.link ?? null)
          : linkOf(model, annotation.id);
      },
      // The verbs go straight to the reconciler chain (latest-wins per
      // parent) and resolve when the children are committed — `get` reads
      // the new value the moment the promise settles.
      set: (ref: AnnotationRef, target: PdfLinkTarget) =>
        scheduleSync(annotationKey(ref), { target }),
      clear: (ref: AnnotationRef) => scheduleSync(annotationKey(ref), { target: null }),
    },
  };

  return { scheduleSync, writeRelationship, api };
}

export type LinkWrites = ReturnType<typeof createLinkWrites>;

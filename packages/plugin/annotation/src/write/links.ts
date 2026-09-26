import {
  contentToPdfRect,
  linkChildrenOf,
  linkOf,
  type Annot,
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
   * children). Each run reads the CURRENT model at execution time, so a
   * chained run converges on the latest desired state.
   */
  const chains = new Map<Id, Promise<void>>();

  /**
   * THE one place attached link children are created, retargeted, re-rected,
   * or deleted. Declarative: desired state = `desired` target + the parent's
   * committed geometry (`linkChildRects`); CURRENT state is read straight
   * from the substrate (`linkChildrenOf`) — no join-key ledger. Results land
   * as ordinary substrate upserts/removes, so the `linkOf` lens converges
   * immediately locally and via events everywhere else. Idempotent — foreign
   * inconsistencies heal on the next local edit.
   */
  const reconcileChildren = async (id: Id, desired: PdfLinkTarget | null): Promise<void> => {
    const doc = ctx.doc;
    const a = store.model().byId[id];
    if (!doc || !a || !a.ref || a.subtype === 'link') return;
    const crop = geometry.cropOf(a.page.pageObjectNumber);
    if (!crop) return;
    const page = doc.page(a.page);
    // Read-only target arms can't be (re)written: children keep their /A and
    // only their rects follow the parent.
    const target = writableTarget(desired);
    const rects = desired == null ? [] : linkChildRects(a).map((r) => contentToPdfRect(r, crop));
    const current = linkChildrenOf(store.model(), id);
    try {
      const paired = Math.min(current.length, rects.length);
      for (let i = 0; i < paired; i++) {
        const ref = current[i].ref;
        if (!ref) continue;
        const res = await page.annotations.update(ref, {
          subtype: 'link',
          rect: rects[i],
          ...(target ? { target } : {}),
        });
        store.commit({ t: 'upsert', annots: [records.ingest(res.updated, crop, 'baked')] });
      }
      for (let i = current.length; i < rects.length; i++) {
        const res = await page.annotations.create({
          subtype: 'link',
          rect: rects[i],
          target,
          inReplyTo: a.ref,
          replyType: 'group',
        });
        store.commit({ t: 'upsert', annots: [records.ingest(res.created, crop, 'baked')] });
      }
      for (let i = rects.length; i < current.length; i++) {
        const child = current[i];
        if (child.ref) await page.annotations.delete(child.ref);
        store.commit({ t: 'remove', ids: [child.id] });
      }
    } catch (err) {
      console.error('[annotation] attached-link sync failed:', err);
    }
  };

  /**
   * Queue a reconcile. `intent` is either an explicit target (a set/clear —
   * captured by THIS run's closure, so chained sets stay latest-wins) or
   * `'keep'` (a geometry follow: re-rect the children toward whatever target
   * the substrate holds AT RUN TIME — so a remote retarget is never undone
   * by a local move). Returns the chain, so `links.set()` can await commit.
   */
  const scheduleSync = (
    id: Id,
    intent: { target: PdfLinkTarget | null } | 'keep',
  ): Promise<void> => {
    const prev = chains.get(id) ?? Promise.resolve();
    const next = prev.then(() =>
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

  /** Write a relationship change to one committed annotation and re-sync it from
   *  the authoritative DTO (preserving its render source — relationships don't
   *  change the appearance). */
  const writeRelationship = async (
    a: Annot,
    rel: { inReplyTo: AnnotationRef | null; replyType?: 'group' },
  ): Promise<void> => {
    const doc = ctx.doc;
    if (!doc || !a.ref || !a.data) return;
    const res = await doc
      .page(a.page)
      .annotations.update(a.ref, relationshipPatch(a.data.subtype, rel));
    records.sync(res.updated, a.source);
  };

  store.onEffect('syncLink', (fx) => {
    if (!ctx.doc) return;
    void scheduleSync(fx.id, { target: fx.target });
  });

  const api = {
    links: {
      get: (ref: AnnotationRef) => {
        const m = store.model();
        const a = m.byId[annotationKey(ref)];
        if (!a) return null;
        return a.subtype === 'link' ? (a.link ?? null) : linkOf(m, a.id);
      },
      // The verbs go straight to the reconciler chain (latest-wins per
      // parent) and resolve when the children are COMMITTED — `get` reads
      // the new value the moment the promise settles.
      set: (ref: AnnotationRef, target: PdfLinkTarget) =>
        scheduleSync(annotationKey(ref), { target }),
      clear: (ref: AnnotationRef) => scheduleSync(annotationKey(ref), { target: null }),
    },
  };

  return { scheduleSync, writeRelationship, api };
}

export type LinkWrites = ReturnType<typeof createLinkWrites>;

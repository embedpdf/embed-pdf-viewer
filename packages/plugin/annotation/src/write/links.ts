import {
  contentToPdfRect,
  linkChildrenOf,
  linkOf,
  type ModelAnnotation,
  type Id,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import { linkChildRects, writableTarget } from '../repository';
import type { AnnotationContext, AnnotationServices } from '../services';
import { named } from './named';

/**
 * Attached links (a Link child riding an editable annotation) and group
 * relationships: the one reconciler that creates, retargets, re-rects and
 * deletes link children, and the relationship-only patch grouping uses.
 */
export function createLinkWrites(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, geometry, identity }: Pick<AnnotationServices, 'store' | 'geometry' | 'identity'>,
) {
  /**
   * Per-parent serialization of attached-link reconciles: rapid edits chain
   * instead of interleaving (two overlapping runs could double-create
   * children). Each run reads the current model at execution time, so a
   * chained run converges on the latest desired state. A chain moves with
   * its parent to a new key, and its runs reconcile the parent's key then.
   */
  const chains = new Map<Id, { parent: Id; tail: Promise<void> }>();
  identity.onFollow((from, to) => {
    const chain = chains.get(from);
    if (!chain) return;
    chains.delete(from);
    chain.parent = to;
    chains.set(to, chain);
  });

  /**
   * The one place attached link children are created, retargeted, re-rected,
   * or deleted. Declarative: desired state = `desired` target + the parent's
   * committed geometry (`linkChildRects`); current state is read straight
   * from the substrate (`linkChildrenOf`) — no join-key ledger. Each write's
   * confirmed record reaches the records mirror before the write resolves, so
   * the `linkOf` lens converges as the run goes, here and in every other
   * session. Idempotent — foreign inconsistencies heal on the next local edit.
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
        await page.annotations.update(ref, {
          subtype: 'link',
          rect: rects[i],
          ...(target ? { target } : {}),
        });
      }
      for (let i = current.length; i < rects.length; i++) {
        await page.annotations.create(
          named({
            subtype: 'link',
            rect: rects[i],
            target,
            reply: { to: annotation.ref, type: 'group' },
          } as AnnotationDraft),
        );
      }
      for (let i = rects.length; i < current.length; i++) {
        const child = current[i];
        if (child.ref) await page.annotations.delete(child.ref);
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
    const chain = chains.get(id) ?? { parent: id, tail: Promise.resolve() };
    chains.set(id, chain);
    const next = chain.tail.then(() =>
      reconcileChildren(
        chain.parent,
        intent === 'keep' ? linkOf(store.model(), chain.parent) : intent.target,
      ),
    );
    chain.tail = next;
    void next.finally(() => {
      if (chain.tail === next && chains.get(chain.parent) === chain) chains.delete(chain.parent);
    });
    return next;
  };

  /** A relationship-only engine patch (sets/clears `/IRT` + `/RT`) — geometry and
   *  style are left untouched, so grouping never re-bakes an appearance. */
  const relationshipPatch = (
    subtype: AnnotationDTO['subtype'],
    reply: { to: AnnotationRef; type?: 'group' } | null,
  ): AnnotationPatch => ({ subtype, reply }) as AnnotationPatch;

  /** Write a relationship change to one committed annotation; the fold applies the result. */
  const writeRelationship = async (
    record: ModelAnnotation,
    reply: { to: AnnotationRef; type?: 'group' } | null,
  ): Promise<void> => {
    if (!record.ref || !record.data) return;
    await ctx.doc
      .page(record.page)
      .annotations.update(record.ref, relationshipPatch(record.data.subtype, reply));
  };

  // A restyle that set or cleared a link: the verb that made it waits for the
  // children. A new record's children are written once its create is.
  store.onEffect('syncLink', (effect) => ({
    ids: [],
    perform: () =>
      identity
        .withRef(effect.id, (ref) => scheduleSync(annotationKey(ref), { target: effect.target }))
        // A record never created has no children; its create reports the refusal.
        .catch(() => {}),
  }));

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

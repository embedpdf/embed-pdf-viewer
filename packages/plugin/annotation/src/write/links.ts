import type { OperationOptions } from '@embedpdf/core';
import {
  type Id,
  kindOf,
  linkChildrenOf,
  linkChildRects,
  linkOf,
  type Model,
  refOf,
  shapeOf,
  styleOf,
  writableTarget,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  type AnnotationDraft,
  type AnnotationRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import { appliedOrThrow } from './outcomes';
import type { AnnotationContext, AnnotationServices } from '../services';
import { opOfStated } from '../services/staging';
import type { StoreChange } from '../services/store';

/**
 * Attached links (a Link child riding an editable annotation): the one
 * reconciler that creates, retargets, re-rects and deletes link children. Its
 * changes join the change that made them needed: a restyle that set a link,
 * a move of the parent.
 */
export function createLinkWrites(
  ctx: Pick<AnnotationContext, 'cancellable'>,
  { store }: Pick<AnnotationServices, 'store'>,
) {
  /**
   * The changes that bring the attached link children of `id` to `desired`,
   * read from `model`. Declarative: desired state = `desired` target + the
   * parent's geometry (`linkChildRects`); current state is read straight from
   * the records (`linkChildrenOf`), new children included: no join-key
   * ledger. Idempotent: foreign inconsistencies heal on the next local edit.
   */
  const childChanges = (id: Id, desired: PdfLinkTarget | null, model: Model): StoreChange[] => {
    const record = model.byId[id];
    const parent = refOf(record);
    if (!record || !parent || kindOf(record.annotation).name === 'link') return [];
    // Read-only target arms can't be (re)written: children keep their /A and
    // only their rects follow the parent.
    const target = writableTarget(desired);
    const rects =
      desired == null ? [] : linkChildRects(shapeOf(record.annotation), styleOf(record.annotation));
    const current = linkChildrenOf(model, id);
    const changes: StoreChange[] = [];
    const paired = Math.min(current.length, rects.length);
    for (let i = 0; i < paired; i++) {
      changes.push({
        type: 'update',
        ref: current[i].annotation.ref,
        patch: { subtype: 'link', rect: rects[i], ...(target ? { target } : {}) },
      });
    }
    for (let i = current.length; i < rects.length; i++) {
      changes.push({
        type: 'create',
        page: record.annotation.page,
        draft: {
          subtype: 'link',
          rect: rects[i],
          target,
          reply: { to: parent, type: 'group' },
        } as AnnotationDraft,
      });
    }
    for (let i = rects.length; i < current.length; i++) {
      changes.push({ type: 'delete', ref: current[i].annotation.ref });
    }
    return changes;
  };

  /** Set or clear a parent's link from code: its children's changes, as one change. */
  const setLink = async (
    ref: AnnotationRef,
    target: PdfLinkTarget | null,
    options: OperationOptions,
  ): Promise<void> => {
    const changes = childChanges(annotationKey(ref), target, store.model());
    if (!changes.length) return;
    await ctx.cancellable(options.signal, store.applyWhenNumbered(changes).then(appliedOrThrow));
  };

  // A restyle that set or cleared a link: the children's changes join it.
  store.onEffect('syncLink', (effect, model) =>
    childChanges(effect.id, effect.target, model).map(opOfStated),
  );

  // An update of a parent, from either door: its children follow its new
  // shape, toward the target they hold, in the same change.
  store.onUpdate((op, model) => {
    const id = annotationKey(op.ref);
    if (!linkChildrenOf(model, id).length) return [];
    return childChanges(id, linkOf(model, id), model).map(opOfStated);
  });

  const api = {
    links: {
      get: (ref: AnnotationRef) => {
        const model = store.model();
        const record = model.byId[annotationKey(ref)];
        if (!record) return null;
        const annotation = record.annotation;
        return annotation.subtype === 'link'
          ? (annotation.target ?? null)
          : linkOf(model, record.id);
      },
      // Resolve once the engine answered: `get` reads the new value at once,
      // and still does then.
      set: (ref: AnnotationRef, target: PdfLinkTarget, options: OperationOptions = {}) =>
        setLink(ref, target, options),
      clear: (ref: AnnotationRef, options: OperationOptions = {}) => setLink(ref, null, options),
    },
  };

  return { childChanges, api };
}

export type LinkWrites = ReturnType<typeof createLinkWrites>;

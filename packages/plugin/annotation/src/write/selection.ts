import { pageRefsEqual } from '@embedpdf/core';
import {
  applyStyleToRange,
  expandGroups,
  geomVisualBounds,
  groupKeyOf,
  isSelectable,
  type ModelAnnotation,
  type AnnotationFlags,
  type AnnotationPropsPatch,
  type Rect,
} from '@embedpdf/core-annotation';
import { intersectRects } from '@embedpdf/core-geometry';
import { annotationKey, type AnnotationRef, type PageRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { SelectionPropsReads } from '../read/selection-props';
import { richDocOf, runDeltaForProps, type TextFormat } from '../rich-text';
import type { AnnotationServices } from '../services';
import type { Crud } from './crud';
import type { LinkWrites } from './links';
import type { TextEditing } from './text-editing';
import { refsOfIn } from '../services/store';

/**
 * The selection: what is selected, and the verbs that restyle, flag, delete,
 * rotate, group and ungroup it as one — every member through the same
 * `update → patch effect → toPatch` path a gesture takes.
 */
export function createSelectionWrites(
  {
    store,
    authority,
    writes,
    fonts,
  }: Pick<AnnotationServices, 'store' | 'authority' | 'writes' | 'fonts'>,
  annotations: Pick<AnnotationReads, 'loadedOrThrow' | 'selectedCommitted'>,
  selectionProps: Pick<SelectionPropsReads, 'activeTextRange' | 'selectionPropsOf'>,
  text: Pick<TextEditing, 'scheduleTextCommit' | 'flushTextCommits'>,
  links: Pick<LinkWrites, 'writeRelationship'>,
  crud: Pick<Crud, 'setRotation' | 'rotationOf'>,
) {
  const selectedRefs = () => refsOfIn(store.model(), store.model().selected);

  // Restyle the selection: One flat props patch through the pure core (the
  // same `update → patch effect → toPatch` path every gesture takes). Each
  // member takes the keys its kind declares and ignores the rest; the model
  // updates optimistically, the engine writes fire per member and re-sync.
  const restyle = (patch: AnnotationPropsPatch): void => {
    const model = store.model();
    const range = selectionProps.activeTextRange(model);
    if (range) {
      // The editor holds a range: font/size/colour/format restyle the
      // runs it covers (a delta over the body, through the pure run
      // algebra); whatever is left restyles the annotation as usual.
      const annotation = model.byId[range.id]!;
      const { delta, rest } = runDeltaForProps(patch, fonts);
      if (Object.keys(delta).length) {
        const next = applyStyleToRange(
          { paragraphs: richDocOf(annotation, fonts).paragraphs },
          range,
          delta,
        );
        store.commit({ type: 'setRichText', id: range.id, doc: next });
        if (annotation.ref) text.scheduleTextCommit(annotation.ref);
      }
      if (Object.keys(rest).length) {
        text.flushTextCommits(); // the props write must not overtake the text
        store.commit({ type: 'setProps', patch: rest });
      }
      return;
    }
    // A body restyle of the annotation being typed in: land the text first
    // so the engine's body rewrite carries the latest paragraphs.
    if (model.editing) text.flushTextCommits();
    store.commit({ type: 'setProps', patch });
  };

  const api = {
    select: (refs: AnnotationRef | readonly AnnotationRef[], options?: { add?: boolean }) => {
      const list = Array.isArray(refs)
        ? (refs as readonly AnnotationRef[])
        : [refs as AnnotationRef];
      store.commit({
        type: 'select',
        ids: list.map((ref) => annotationKey(ref)),
        add: options?.add,
      });
    },
    selectAll: (page?: PageRef) => {
      const model = store.model();
      const ids = model.order.filter((id) => {
        const annotation = model.byId[id];
        return (
          !!annotation && (!page || pageRefsEqual(annotation.page, page)) && isSelectable(model, id)
        );
      });
      store.commit({ type: 'select', ids });
    },
    selectInRect: (page: PageRef, rect: Rect, options?: { add?: boolean }) => {
      const model = store.model();
      const ids = model.order.filter((id) => {
        const annotation = model.byId[id];
        if (!annotation || !pageRefsEqual(annotation.page, page) || !isSelectable(model, id))
          return false;
        const hit = intersectRects(
          geomVisualBounds(
            annotation.geometry,
            annotation.style.strokeWidth,
            annotation.style.border,
          ),
          rect,
        );
        return hit.width > 0 && hit.height > 0;
      });
      if (ids.length || !options?.add) store.commit({ type: 'select', ids, add: options?.add });
    },
    clearSelection: () => {
      store.commit({ type: 'deselect' });
    },
    updateSelection: (patch: AnnotationPropsPatch) => {
      const refs = selectedRefs();
      const { writes: pending } = writes.collect(() => restyle(patch));
      return writes.settle(refs, pending);
    },
    updateSelectionFlags: (patch: Partial<AnnotationFlags>) => {
      const refs = selectedRefs();
      const { writes: pending } = writes.collect(() => store.commit({ type: 'setFlags', patch }));
      return writes.settle(refs, pending);
    },
    deleteSelection: () => {
      const refs = selectedRefs();
      const { writes: pending } = writes.collect(() => store.commit({ type: 'delete' }));
      return writes.settle(refs, pending);
    },
    rotateSelectionBy: async (delta: 90 | -90) => {
      if (delta === 90) {
        const { writes: pending } = writes.collect(() => store.commit({ type: 'rotate90' }));
        await writes.awaitAll(pending);
        return;
      }
      for (const ref of selectedRefs())
        await crud.setRotation(ref, crud.rotationOf(annotations.loadedOrThrow(ref)) - 90);
    },
    resetSelectionRotation: async () => {
      const { writes: pending } = writes.collect(() => store.commit({ type: 'resetRotation' }));
      await writes.awaitAll(pending);
    },
    toggleTextFormat: async (format: TextFormat) => {
      const current = selectionProps.selectionPropsOf().values[format];
      const { writes: pending } = writes.collect(() =>
        restyle({ [format]: !current } as AnnotationPropsPatch),
      );
      await writes.awaitAll(pending);
    },
    // Grouping writes a relationship (`/IRT` + `/RT /Group`) onto every
    // subordinate; ungrouping clears it, so each member becomes top-level again.
    group: async (): Promise<void> => {
      const model = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return;
      const pageObjectNumber = members[0].page.pageObjectNumber;
      if (members.some((annotation) => annotation.page.pageObjectNumber !== pageObjectNumber))
        return; // groups are page-local
      const ordered = [...members].sort(
        (left, right) => model.order.indexOf(left.id) - model.order.indexOf(right.id),
      );
      const [primary, ...rest] = ordered;
      if (!primary.ref) return;
      await Promise.all(
        rest.map((annotation) =>
          links.writeRelationship(annotation, { inReplyTo: primary.ref, replyType: 'group' }),
        ),
      );
    },
    ungroup: async (): Promise<void> => {
      const model = store.model();
      const subs = expandGroups(model, model.selected)
        .map((id) => model.byId[id])
        .filter(
          (annotation): annotation is ModelAnnotation =>
            !!annotation && !!annotation.ref && !!annotation.data && !!annotation.group,
        );
      await Promise.all(
        subs.map((annotation) => links.writeRelationship(annotation, { inReplyTo: null })),
      );
    },
    canGroup: (): boolean => {
      const model = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return false;
      if (
        members.some(
          (annotation) => annotation.page.pageObjectNumber !== members[0].page.pageObjectNumber,
        )
      )
        return false;
      // Grouping writes a relationship onto every member — each must
      // pass the per-record update check.
      if (
        !members.every(
          (annotation) =>
            annotation.ref != null && authority.allowsMutation('update', annotation.ref),
        )
      )
        return false;
      // Already exactly one complete group → nothing to do.
      const keys = new Set(model.selected.map((id) => groupKeyOf(model, id)));
      if (keys.size === 1 && !keys.has(null)) return false;
      return true;
    },
    canUngroup: (): boolean => {
      const model = store.model();
      // Ungrouping clears the relationship on every member of every
      // selected group — same per-record write gate as `ungroup` hits.
      const subs = expandGroups(model, model.selected)
        .map((id) => model.byId[id])
        .filter((annotation): annotation is ModelAnnotation => !!annotation && !!annotation.group);
      return (
        subs.length > 0 &&
        subs.every(
          (annotation) =>
            annotation.ref != null && authority.allowsMutation('update', annotation.ref),
        )
      );
    },
  };

  return { api };
}

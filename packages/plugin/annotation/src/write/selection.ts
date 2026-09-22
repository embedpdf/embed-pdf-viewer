import { pageRefsEqual } from '@embedpdf/core';
import {
  applyStyleToRange,
  expandGroups,
  geomVisualBounds,
  groupKeyOf,
  isSelectable,
  type Annot,
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

  // Restyle the selection: ONE flat props patch through the pure core (the
  // same `update → patch effect → toPatch` path every gesture takes). Each
  // member takes the keys its kind declares and ignores the rest; the model
  // updates optimistically, the engine writes fire per member and re-sync.
  const restyle = (patch: AnnotationPropsPatch): void => {
    const m = store.model();
    const range = selectionProps.activeTextRange(m);
    if (range) {
      // The editor holds a range: font/size/colour/format restyle the
      // RUNS it covers (a delta over the body, through the pure run
      // algebra); whatever is left restyles the annotation as usual.
      const a = m.byId[range.id]!;
      const { delta, rest } = runDeltaForProps(patch, fonts);
      if (Object.keys(delta).length) {
        const next = applyStyleToRange(
          { paragraphs: richDocOf(a, fonts).paragraphs },
          range,
          delta,
        );
        store.commit({ t: 'setRichText', id: range.id, doc: next });
        if (a.ref) text.scheduleTextCommit(a.ref);
      }
      if (Object.keys(rest).length) {
        text.flushTextCommits(); // the props write must not overtake the text
        store.commit({ t: 'setProps', patch: rest });
      }
      return;
    }
    // A body restyle of the annotation being typed in: land the text first
    // so the engine's body rewrite carries the latest paragraphs.
    if (m.editing) text.flushTextCommits();
    store.commit({ t: 'setProps', patch });
  };

  const api = {
    select: (refs: AnnotationRef | readonly AnnotationRef[], options?: { add?: boolean }) => {
      const list = Array.isArray(refs)
        ? (refs as readonly AnnotationRef[])
        : [refs as AnnotationRef];
      store.commit({ t: 'select', ids: list.map((r) => annotationKey(r)), add: options?.add });
    },
    selectAll: (page?: PageRef) => {
      const m = store.model();
      const ids = m.order.filter((id) => {
        const a = m.byId[id];
        return !!a && (!page || pageRefsEqual(a.page, page)) && isSelectable(m, id);
      });
      store.commit({ t: 'select', ids });
    },
    selectInRect: (page: PageRef, rect: Rect, options?: { add?: boolean }) => {
      const m = store.model();
      const ids = m.order.filter((id) => {
        const a = m.byId[id];
        if (!a || !pageRefsEqual(a.page, page) || !isSelectable(m, id)) return false;
        const hit = intersectRects(
          geomVisualBounds(a.geom, a.style.strokeWidth, a.style.border),
          rect,
        );
        return hit.width > 0 && hit.height > 0;
      });
      if (ids.length || !options?.add) store.commit({ t: 'select', ids, add: options?.add });
    },
    clearSelection: () => {
      store.commit({ t: 'deselect' });
    },
    updateSelection: (patch: AnnotationPropsPatch) => {
      const refs = selectedRefs();
      const { writes: pending } = writes.collect(() => restyle(patch));
      return writes.settle(refs, pending);
    },
    updateSelectionFlags: (patch: Partial<AnnotationFlags>) => {
      const refs = selectedRefs();
      const { writes: pending } = writes.collect(() => store.commit({ t: 'setFlags', patch }));
      return writes.settle(refs, pending);
    },
    deleteSelection: () => {
      const refs = selectedRefs();
      const { writes: pending } = writes.collect(() => store.commit({ t: 'delete' }));
      return writes.settle(refs, pending);
    },
    rotateSelectionBy: async (delta: 90 | -90) => {
      if (delta === 90) {
        const { writes: pending } = writes.collect(() => store.commit({ t: 'rotate90' }));
        await writes.awaitAll(pending);
        return;
      }
      for (const ref of selectedRefs())
        await crud.setRotation(ref, crud.rotationOf(annotations.loadedOrThrow(ref)) - 90);
    },
    resetSelectionRotation: async () => {
      const { writes: pending } = writes.collect(() => store.commit({ t: 'resetRotation' }));
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
      const m = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return;
      const pon = members[0].page.pageObjectNumber;
      if (members.some((a) => a.page.pageObjectNumber !== pon)) return; // groups are page-local
      const ordered = [...members].sort((a, b) => m.order.indexOf(a.id) - m.order.indexOf(b.id));
      const [primary, ...rest] = ordered;
      if (!primary.ref) return;
      await Promise.all(
        rest.map((a) => links.writeRelationship(a, { inReplyTo: primary.ref, replyType: 'group' })),
      );
    },
    ungroup: async (): Promise<void> => {
      const m = store.model();
      const subs = expandGroups(m, m.selected)
        .map((id) => m.byId[id])
        .filter((a): a is Annot => !!a && !!a.ref && !!a.data && !!a.group);
      await Promise.all(subs.map((a) => links.writeRelationship(a, { inReplyTo: null })));
    },
    canGroup: (): boolean => {
      const m = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return false;
      if (members.some((a) => a.page.pageObjectNumber !== members[0].page.pageObjectNumber))
        return false;
      // Grouping WRITES a relationship onto every member — each must
      // pass the per-record update check.
      if (!members.every((a) => a.ref != null && authority.allowsMutation('update', a.ref)))
        return false;
      // Already exactly one complete group → nothing to do.
      const keys = new Set(m.selected.map((id) => groupKeyOf(m, id)));
      if (keys.size === 1 && !keys.has(null)) return false;
      return true;
    },
    canUngroup: (): boolean => {
      const m = store.model();
      // Ungrouping clears the relationship on every member of every
      // selected group — same per-record write gate as `ungroup` hits.
      const subs = expandGroups(m, m.selected)
        .map((id) => m.byId[id])
        .filter((a): a is Annot => !!a && !!a.group);
      return (
        subs.length > 0 &&
        subs.every((a) => a.ref != null && authority.allowsMutation('update', a.ref))
      );
    },
  };

  return { api };
}

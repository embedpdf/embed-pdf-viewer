import { pageRefsEqual } from '@embedpdf/core';
import {
  type AnnotationFlags,
  applyStyleToRange,
  expandGroups,
  fieldsOf,
  type FieldValues,
  geomVisualBounds,
  groupKeyOf,
  groupOf,
  type Id,
  isSelectable,
  type ModelAnnotation,
  type Rect,
  refOf,
  richDocOf,
} from '@embedpdf/core-annotation';
import { intersectRects } from '@embedpdf/core-geometry';
import {
  annotationKey,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
  type PageRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { SelectionFieldsReads } from '../read/selection-fields';
import { runDeltaForFields, type TextFormat } from '../rich-text';
import type { AnnotationServices } from '../services';
import type { Crud } from './crud';
import type { LinkWrites } from './links';
import { batchResultOf, throwIfFailed } from './outcomes';
import { rotationOf } from './page-patch';
import type { TextEditing } from './text-editing';
import { refsOfIn, type Commit } from '../services/store';

/**
 * The selection: what is selected, and the verbs that change its fields,
 * link, flag, delete, rotate, group and ungroup it as one — every member
 * through the same `update → patch effect` path a gesture takes.
 */
export function createSelectionWrites(
  { store, authority, fonts }: Pick<AnnotationServices, 'store' | 'authority' | 'fonts'>,
  annotations: Pick<AnnotationReads, 'loadedOrThrow' | 'selectedCommitted'>,
  selectionFields: Pick<SelectionFieldsReads, 'activeTextRange' | 'selectionFieldsOf'>,
  text: Pick<TextEditing, 'flushAllText'>,
  links: Pick<LinkWrites, 'writeRelationship'>,
  crud: Pick<Crud, 'setRotation'>,
) {
  const selectedRefs = () => refsOfIn(store.model(), store.model().selected);

  /** Commit a selection message; resolves with its outcome over the refs that were selected. */
  const commitOverSelection = async (commit: () => Commit[]) => {
    const refs = selectedRefs();
    const outcomes = await Promise.all(commit().map((committed) => committed.written));
    return batchResultOf(refs, { failed: outcomes.flatMap((outcome) => outcome.failed) });
  };

  /**
   * Change the selection's fields, a patch per member (a function patches
   * each relative to itself), through the pure core like every gesture: each
   * member takes the fields its kind has, the change shows at once and one
   * engine write runs per member. While the text editor holds a range, the
   * font, size, colour and formats restyle the runs it covers (a delta over
   * the body, through the pure run algebra) and the rest goes to the
   * annotation.
   */
  const restyle = (patch: FieldValues | ((annotation: AnnotationDTO) => FieldValues)): Commit[] => {
    const model = store.model();
    const range = selectionFields.activeTextRange(model);
    const commits: Commit[] = [];
    const patches: Record<Id, FieldValues> = {};
    for (const id of model.selected) {
      const annotation = model.byId[id];
      if (!annotation) continue;
      const own = typeof patch === 'function' ? patch(annotation.annotation) : patch;
      if (range?.id !== id) {
        patches[id] = own;
        continue;
      }
      const { delta, rest } = runDeltaForFields(own, fonts);
      if (Object.keys(delta).length) {
        const next = applyStyleToRange(
          { paragraphs: richDocOf(fieldsOf(annotation), fonts).paragraphs },
          range,
          delta,
        );
        commits.push(store.commit({ type: 'setRichText', id, doc: next }));
      }
      patches[id] = rest;
    }
    if (Object.values(patches).some((fields) => Object.keys(fields).length)) {
      // A body restyle of the annotation being typed in: land the text first
      // so the engine's body rewrite carries the latest paragraphs.
      if (model.editing) text.flushAllText();
      commits.push(store.commit({ type: 'setFields', patches }));
    }
    return commits;
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
          !!annotation &&
          (!page || pageRefsEqual(annotation.annotation.page, page)) &&
          isSelectable(model, id)
        );
      });
      store.commit({ type: 'select', ids });
    },
    selectInRect: (page: PageRef, rect: Rect, options?: { add?: boolean }) => {
      const model = store.model();
      const ids = model.order.filter((id) => {
        const annotation = model.byId[id];
        if (
          !annotation ||
          !pageRefsEqual(annotation.annotation.page, page) ||
          !isSelectable(model, id)
        )
          return false;
        const { geometry, style } = fieldsOf(annotation);
        const hit = intersectRects(
          geomVisualBounds(geometry, style.strokeWidth, style.border),
          rect,
        );
        return hit.width > 0 && hit.height > 0;
      });
      if (ids.length || !options?.add) store.commit({ type: 'select', ids, add: options?.add });
    },
    clearSelection: () => {
      store.commit({ type: 'deselect' });
    },
    updateSelection: (patch: AnnotationPatch | ((annotation: AnnotationDTO) => AnnotationPatch)) =>
      commitOverSelection(() => restyle(patch as FieldValues)),
    updateSelectionLink: (target: PdfLinkTarget | null) =>
      commitOverSelection(() => [store.commit({ type: 'setLink', target })]),
    updateSelectionFlags: (patch: Partial<AnnotationFlags>) =>
      commitOverSelection(() => [store.commit({ type: 'setFlags', patch })]),
    deleteSelection: () => commitOverSelection(() => [store.commit({ type: 'delete' })]),
    rotateSelectionBy: async (delta: 90 | -90) => {
      if (delta === 90) {
        throwIfFailed(await store.commit({ type: 'rotate90' }).written);
        return;
      }
      for (const ref of selectedRefs()) {
        const annotation = annotations.loadedOrThrow(ref);
        await crud.setRotation(ref, rotationOf(fieldsOf(annotation).geometry) - 90);
      }
    },
    resetSelectionRotation: async () => {
      throwIfFailed(await store.commit({ type: 'resetRotation' }).written);
    },
    toggleTextFormat: async (format: TextFormat) => {
      const on = selectionFields.selectionFieldsOf().values[format] !== true;
      const model = store.model();
      const range = selectionFields.activeTextRange(model);
      // A held range takes the format as a run delta; otherwise each body
      // does, once the text being typed has landed.
      if (!range && model.editing) text.flushAllText();
      const commits = range
        ? restyle({ [format]: on })
        : [store.commit({ type: 'setTextFormat', format, on })];
      const outcomes = await Promise.all(commits.map((commit) => commit.written));
      outcomes.forEach(throwIfFailed);
    },
    // Grouping writes a relationship (`/IRT` + `/RT /Group`) onto every
    // subordinate; ungrouping clears it, so each member becomes top-level again.
    group: async (): Promise<void> => {
      const model = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return;
      const pageObjectNumber = members[0].annotation.page.objectNumber;
      if (
        members.some((annotation) => annotation.annotation.page.objectNumber !== pageObjectNumber)
      )
        return; // groups are page-local
      const ordered = [...members].sort(
        (left, right) => model.order.indexOf(left.id) - model.order.indexOf(right.id),
      );
      const [primary, ...rest] = ordered;
      const primaryRef = refOf(primary);
      if (!primaryRef) return;
      await Promise.all(
        rest.map((annotation) =>
          links.writeRelationship(annotation, { to: primaryRef, type: 'group' }),
        ),
      );
    },
    ungroup: async (): Promise<void> => {
      const model = store.model();
      const subs = expandGroups(model, model.selected)
        .map((id) => model.byId[id])
        .filter(
          (annotation): annotation is ModelAnnotation =>
            !!annotation && !!refOf(annotation) && !!groupOf(annotation.annotation),
        );
      await Promise.all(subs.map((annotation) => links.writeRelationship(annotation, null)));
    },
    canGroup: (): boolean => {
      const model = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return false;
      if (
        members.some(
          (annotation) =>
            annotation.annotation.page.objectNumber !== members[0].annotation.page.objectNumber,
        )
      )
        return false;
      // Grouping writes a relationship onto every member — each must
      // pass the per-record update check.
      if (
        !members.every((annotation) => {
          const ref = refOf(annotation);
          return ref != null && authority.allowsMutation('update', ref);
        })
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
        .filter(
          (annotation): annotation is ModelAnnotation =>
            !!annotation && !!groupOf(annotation.annotation),
        );
      return (
        subs.length > 0 &&
        subs.every((annotation) => {
          const ref = refOf(annotation);
          return ref != null && authority.allowsMutation('update', ref);
        })
      );
    },
  };

  return { api };
}

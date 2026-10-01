import type { OperationOptions } from '@embedpdf/core';
import {
  applyStyleToRange,
  expandGroups,
  type FieldValues,
  groupKeyOf,
  groupOf,
  type Id,
  isSelectable,
  type ModelAnnotation,
  type Rect,
  refOf,
  richDocOf,
  selectionInBox,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  type Annotation,
  type AnnotationPatch,
  type AnnotationRef,
  type PageRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import type { AnnotationContext } from '../services';
import type { AnnotationReads } from '../read/annotations';
import type { ChromeReads } from '../read/chrome';
import type { PropertyReads } from '../read/properties';
import { runDeltaForFields, type TextFormat } from '../rich-text';
import type { AnnotationServices } from '../services';
import type { LinkWrites } from './links';
import { batchResultOf, throwIfFailed } from './outcomes';
import type { TextEditing } from './text-editing';
import { refsOfIn, type Commit } from '../services/store';

/**
 * The selection: what is selected, and the verbs that change its fields,
 * link, delete, rotate, group and ungroup it as one, every member through the
 * same `update → patch effect` path a gesture takes.
 */
export function createSelectionWrites(
  ctx: Pick<AnnotationContext, 'pageOf' | 'getPage' | 'cancellable'>,
  {
    store,
    authority,
    fonts,
    behaviors,
  }: Pick<AnnotationServices, 'store' | 'authority' | 'fonts' | 'behaviors'>,
  annotations: Pick<AnnotationReads, 'selectedCommitted' | 'listSelected'>,
  properties: Pick<PropertyReads, 'activeTextRange' | 'selectionPropertiesOf'>,
  chrome: Pick<ChromeReads, 'selectionAnchor' | 'rotationAnchor'>,
  text: Pick<TextEditing, 'flushAllText'>,
  links: Pick<LinkWrites, 'writeRelationship'>,
) {
  const selectedRefs = () => refsOfIn(store.model(), store.model().selected);

  /** Commit a selection message; resolves with its outcome over the refs that were selected. */
  const commitOverSelection = async (commit: () => Commit[], signal?: AbortSignal) => {
    const refs = selectedRefs();
    const outcomes = await ctx.cancellable(
      signal,
      Promise.all(commit().map((committed) => committed.written)),
    );
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
  const restyle = (patch: FieldValues | ((annotation: Annotation) => FieldValues)): Commit[] => {
    const model = store.model();
    const range = properties.activeTextRange(model);
    const commits: Commit[] = [];
    const patches: Record<Id, FieldValues> = {};
    for (const id of model.selected) {
      const record = model.byId[id];
      if (!record) continue;
      const own = typeof patch === 'function' ? patch(record.annotation) : patch;
      if (range?.id !== id) {
        patches[id] = own;
        continue;
      }
      const { delta, rest } = runDeltaForFields(own, fonts);
      if (Object.keys(delta).length) {
        const next = applyStyleToRange(
          { paragraphs: richDocOf(record.annotation, fonts).paragraphs },
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

  /** Select by refs, group-aware; `add` keeps the current selection. */
  const select = (refs: readonly AnnotationRef[], add: boolean): void => {
    store.commit({ type: 'select', ids: refs.map((ref) => annotationKey(ref)), add });
  };

  /**
   * Bold, italic or underline on or off: the words selected while typing, or
   * the whole of each selected text box once the text being typed has landed.
   */
  const toggleFormat = async (format: TextFormat, options: OperationOptions = {}) => {
    const on = properties.selectionPropertiesOf().values[format] !== true;
    const model = store.model();
    const range = properties.activeTextRange(model);
    if (!range && model.editing) text.flushAllText();
    const commits = range
      ? restyle({ [format]: on })
      : [store.commit({ type: 'setTextFormat', format, on })];
    const outcomes = await ctx.cancellable(
      options.signal,
      Promise.all(commits.map((commit) => commit.written)),
    );
    outcomes.forEach(throwIfFailed);
  };

  /** The `selection` noun (its reads come from the property and chrome reads). */
  const selection = {
    set: (refs: readonly AnnotationRef[]) => select(refs, false),
    add: (refs: readonly AnnotationRef[]) => select(refs, true),
    selectAll: (page?: PageRef | number) => {
      // A page that isn't in the document has nothing to select.
      const only = page === undefined ? null : ctx.getPage(page);
      if (page !== undefined && !only) {
        store.commit({ type: 'deselect' });
        return;
      }
      const model = store.model();
      const ids = model.order.filter((id) => {
        const record = model.byId[id];
        return (
          !!record &&
          (!only || record.annotation.page.objectNumber === only.ref.objectNumber) &&
          isSelectable(model, id)
        );
      });
      store.commit({ type: 'select', ids });
    },
    selectInRect: (page: PageRef | number, rect: Rect) => {
      const { ref } = ctx.pageOf(page);
      const engaged = behaviors.engagedIdsOn(ref.objectNumber);
      store.commit({ type: 'select', ids: selectionInBox(store.model(), ref, rect, engaged) });
    },
    clear: () => {
      store.commit({ type: 'deselect' });
    },
    list: () => annotations.listSelected(),
    update: (
      changes: AnnotationPatch | ((annotation: Annotation) => AnnotationPatch),
      options: OperationOptions = {},
    ) => commitOverSelection(() => restyle(changes as FieldValues), options.signal),
    updateLink: (target: PdfLinkTarget | null, options: OperationOptions = {}) =>
      commitOverSelection(() => [store.commit({ type: 'setLink', target })], options.signal),
    getProperties: () => properties.selectionPropertiesOf(),
    delete: (options: OperationOptions = {}) =>
      commitOverSelection(() => [store.commit({ type: 'delete' })], options.signal),
    rotateBy: async (degrees: 90 | -90, options: OperationOptions = {}) => {
      const commit = store.commit({ type: 'rotateSelection', degrees });
      throwIfFailed(await ctx.cancellable(options.signal, commit.written));
    },
    resetRotation: async (options: OperationOptions = {}) => {
      const commit = store.commit({ type: 'resetRotation' });
      throwIfFailed(await ctx.cancellable(options.signal, commit.written));
    },
    getAnchor: () => chrome.selectionAnchor(),
    getRotationAnchor: () => chrome.rotationAnchor(),
    // Grouping writes a relationship (`/IRT` + `/RT /Group`) onto every
    // subordinate; ungrouping clears it, so each member becomes top-level again.
    group: async (options: OperationOptions = {}): Promise<void> => {
      const model = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return;
      const pageObjectNumber = members[0].annotation.page.objectNumber;
      if (members.some((record) => record.annotation.page.objectNumber !== pageObjectNumber))
        return; // groups are page-local
      const ordered = [...members].sort(
        (left, right) => model.order.indexOf(left.id) - model.order.indexOf(right.id),
      );
      const [primary, ...rest] = ordered;
      const primaryRef = refOf(primary);
      if (!primaryRef) return;
      await ctx.cancellable(
        options.signal,
        Promise.all(
          rest.map((record) => links.writeRelationship(record, { to: primaryRef, type: 'group' })),
        ),
      );
    },
    ungroup: async (options: OperationOptions = {}): Promise<void> => {
      const model = store.model();
      const subs = expandGroups(model, model.selected)
        .map((id) => model.byId[id])
        .filter(
          (record): record is ModelAnnotation =>
            !!record && !!refOf(record) && !!groupOf(record.annotation),
        );
      await ctx.cancellable(
        options.signal,
        Promise.all(subs.map((record) => links.writeRelationship(record, null))),
      );
    },
    canGroup: (): boolean => {
      const model = store.model();
      const members = annotations.selectedCommitted();
      if (members.length < 2) return false;
      if (
        members.some(
          (record) =>
            record.annotation.page.objectNumber !== members[0].annotation.page.objectNumber,
        )
      )
        return false;
      // Grouping writes a relationship onto every member — each must
      // pass the per-record update check.
      if (
        !members.every((record) => {
          const ref = refOf(record);
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
        .filter((record): record is ModelAnnotation => !!record && !!groupOf(record.annotation));
      return (
        subs.length > 0 &&
        subs.every((record) => {
          const ref = refOf(record);
          return ref != null && authority.allowsMutation('update', ref);
        })
      );
    },
  };

  return { selection, toggleFormat };
}

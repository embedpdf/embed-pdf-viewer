import {
  FLAG_KEYS,
  linkOf,
  readProp,
  sharedProps,
  type ModelAnnotation,
  type AnnotationProps,
  type Model,
  type PropKey,
} from '@embedpdf/core-annotation';

import type { SelectionFlags, SelectionProps } from '../contract';
import { RANGE_KEYS, rangeProps, richDocOf, type TextSelection } from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';

/**
 * The selection's editable properties and `/F` flags, ready for a sidebar —
 * memoized by model identity so a subscribed panel re-renders only when the
 * model actually changed.
 */
export function createSelectionPropsReads(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, fonts }: Pick<AnnotationServices, 'store' | 'fonts'>,
) {
  /** The editor's text range inside the annotation being edited, or null
   *  (no editor selection, a bare caret, or a selection left behind by a
   *  previous edit). The one condition that routes the range keys to runs. */
  const activeTextRange = (model: Model): TextSelection | null => {
    const ts = ctx.state.get().textSelection;
    return ts && model.editing === ts.id && ts.end > ts.start && model.byId[ts.id] ? ts : null;
  };

  let selPropsCache: {
    model: Model;
    range: TextSelection | null;
    v: SelectionProps;
  } | null = null;
  const selectionPropsOf = (): SelectionProps => {
    const model = store.model();
    const range = activeTextRange(model);
    if (selPropsCache && selPropsCache.model === model && selPropsCache.range === range) {
      return selPropsCache.v;
    }
    const members = model.selected
      .map((id) => model.byId[id])
      .filter((annotation): annotation is ModelAnnotation => !!annotation);
    const specs = sharedProps(members.map((annotation) => annotation.subtype));
    const values: Partial<AnnotationProps> = {};
    const mixed: PropKey[] = [];
    // `link` is the one derived value: parents store nothing — the committed
    // children are the truth, read through the lens (the link kind still
    // reads its own /A off the annot).
    const valueOf = (annotation: ModelAnnotation, key: PropKey): unknown =>
      key === 'link' && annotation.subtype !== 'link'
        ? linkOf(model, annotation.id)
        : readProp(annotation, key);
    for (const spec of specs) {
      const first = valueOf(members[0], spec.key);
      (values as Record<PropKey, unknown>)[spec.key] = first;
      const firstJson = JSON.stringify(first);
      if (members.some((annotation) => JSON.stringify(valueOf(annotation, spec.key)) !== firstJson))
        mixed.push(spec.key);
    }
    // While the editor holds a range in the (sole) selected free text, the
    // range keys report the runs it covers, resolved against the body — the
    // same values `updateSelection` would restyle.
    if (range && members.length === 1 && members[0]!.id === range.id) {
      const rp = rangeProps(richDocOf(members[0]!, fonts), range, fonts);
      for (const spec of specs) {
        if (!RANGE_KEYS.includes(spec.key)) continue;
        (values as Record<PropKey, unknown>)[spec.key] = rp.values[spec.key];
        const index = mixed.indexOf(spec.key);
        if (index >= 0) mixed.splice(index, 1);
        if (rp.mixed.includes(spec.key)) mixed.push(spec.key);
      }
    }
    const props: SelectionProps = { specs, values, mixed };
    selPropsCache = { model, range, v: props };
    return props;
  };

  // The selection's `/F` state — per-flag value, `null` where members disagree.
  let selFlagsCache: { model: Model; v: SelectionFlags | null } | null = null;
  const selectionFlagsOf = (): SelectionFlags | null => {
    const model = store.model();
    if (selFlagsCache && selFlagsCache.model === model) return selFlagsCache.v;
    const members = model.selected
      .map((id) => model.byId[id])
      .filter((annotation): annotation is ModelAnnotation => !!annotation);
    let flags: SelectionFlags | null = null;
    if (members.length) {
      flags = {} as SelectionFlags;
      for (const key of FLAG_KEYS) {
        const first = members[0].flags[key];
        flags[key] = members.every((annotation) => annotation.flags[key] === first) ? first : null;
      }
    }
    selFlagsCache = { model, v: flags };
    return flags;
  };

  const api = {
    getSelectionProps: () => selectionPropsOf(),
    getSelectionFlags: () => selectionFlagsOf(),
  };

  return { activeTextRange, selectionPropsOf, api };
}

export type SelectionPropsReads = ReturnType<typeof createSelectionPropsReads>;

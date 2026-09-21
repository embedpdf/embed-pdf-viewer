import {
  FLAG_KEYS,
  linkOf,
  readProp,
  sharedProps,
  type Annot,
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
  ctx: Pick<AnnotationContext, 'getState'>,
  { store, fonts }: Pick<AnnotationServices, 'store' | 'fonts'>,
) {
  /** The editor's text RANGE inside the annotation being edited, or null
   *  (no editor selection, a bare caret, or a selection left behind by a
   *  previous edit). The one condition that routes the range keys to runs. */
  const activeTextRange = (m: Model): TextSelection | null => {
    const ts = ctx.getState().textSelection;
    return ts && m.editing === ts.id && ts.end > ts.start && m.byId[ts.id] ? ts : null;
  };

  let selPropsCache: {
    model: Model;
    range: TextSelection | null;
    v: SelectionProps;
  } | null = null;
  const selectionPropsOf = (): SelectionProps => {
    const m = store.model();
    const range = activeTextRange(m);
    if (selPropsCache && selPropsCache.model === m && selPropsCache.range === range) {
      return selPropsCache.v;
    }
    const members = m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a);
    const specs = sharedProps(members.map((a) => a.subtype));
    const values: Partial<AnnotationProps> = {};
    const mixed: PropKey[] = [];
    // `link` is the one derived value: parents store nothing — the committed
    // children are the truth, read through the lens (the link KIND still
    // reads its own /A off the annot).
    const valueOf = (a: Annot, key: PropKey): unknown =>
      key === 'link' && a.subtype !== 'link' ? linkOf(m, a.id) : readProp(a, key);
    for (const spec of specs) {
      const first = valueOf(members[0], spec.key);
      (values as Record<PropKey, unknown>)[spec.key] = first;
      const firstJson = JSON.stringify(first);
      if (members.some((a) => JSON.stringify(valueOf(a, spec.key)) !== firstJson))
        mixed.push(spec.key);
    }
    // While the editor holds a range in the (sole) selected free text, the
    // range keys report the RUNS it covers, resolved against the body — the
    // same values `updateSelection` would restyle.
    if (range && members.length === 1 && members[0]!.id === range.id) {
      const rp = rangeProps(richDocOf(members[0]!, fonts), range, fonts);
      for (const spec of specs) {
        if (!RANGE_KEYS.includes(spec.key)) continue;
        (values as Record<PropKey, unknown>)[spec.key] = rp.values[spec.key];
        const i = mixed.indexOf(spec.key);
        if (i >= 0) mixed.splice(i, 1);
        if (rp.mixed.includes(spec.key)) mixed.push(spec.key);
      }
    }
    const v: SelectionProps = { specs, values, mixed };
    selPropsCache = { model: m, range, v };
    return v;
  };

  // The selection's `/F` state — per-flag value, `null` where members disagree.
  let selFlagsCache: { model: Model; v: SelectionFlags | null } | null = null;
  const selectionFlagsOf = (): SelectionFlags | null => {
    const m = store.model();
    if (selFlagsCache && selFlagsCache.model === m) return selFlagsCache.v;
    const members = m.selected.map((id) => m.byId[id]).filter((a): a is Annot => !!a);
    let v: SelectionFlags | null = null;
    if (members.length) {
      v = {} as SelectionFlags;
      for (const key of FLAG_KEYS) {
        const first = members[0].flags[key];
        v[key] = members.every((a) => a.flags[key] === first) ? first : null;
      }
    }
    selFlagsCache = { model: m, v };
    return v;
  };

  const api = {
    getSelectionProps: () => selectionPropsOf(),
    getSelectionFlags: () => selectionFlagsOf(),
  };

  return { activeTextRange, selectionPropsOf, api };
}

export type SelectionPropsReads = ReturnType<typeof createSelectionPropsReads>;

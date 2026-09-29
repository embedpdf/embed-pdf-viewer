import {
  fieldsOf,
  FLAG_KEYS,
  kindOf,
  linkOf,
  type Model,
  type ModelAnnotation,
  richDocOf,
  sharedFields,
} from '@embedpdf/core-annotation';

import type { EditableFields, SelectionFlags } from '../contract';
import { RANGE_KEYS, rangeProps, type TextSelection } from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';
import { fieldValue, fieldValues, type FieldSources } from './field-values';

/**
 * The selection's editable fields and `/F` flags, ready for a sidebar —
 * memoized by model identity so a subscribed panel re-renders only when the
 * model actually changed.
 */
export function createSelectionFieldsReads(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, fonts }: Pick<AnnotationServices, 'store' | 'fonts'>,
) {
  /** The editor's text range inside the annotation being edited, or null
   *  (no editor selection, a bare caret, or a selection left behind by a
   *  previous edit). The one condition that routes the range fields to runs. */
  const activeTextRange = (model: Model): TextSelection | null => {
    const ts = ctx.state.get().textSelection;
    return ts && model.editing === ts.id && ts.end > ts.start && model.byId[ts.id] ? ts : null;
  };

  /** What a sidebar reads of one member: its fields, its text as shown, and its link. */
  const sourcesOf = (model: Model, annotation: ModelAnnotation): FieldSources => {
    const { text, link } = fieldsOf(annotation);
    return {
      data: annotation.annotation as unknown as Record<string, unknown>,
      ...(text ? { text } : {}),
      // Parents store no link: the committed children are the truth, read
      // through the lens. The link kind reads its own target.
      link:
        kindOf(annotation.annotation) === 'link' ? (link ?? null) : linkOf(model, annotation.id),
    };
  };

  let cache: { model: Model; range: TextSelection | null; v: EditableFields } | null = null;
  const selectionFieldsOf = (): EditableFields => {
    const model = store.model();
    const range = activeTextRange(model);
    if (cache && cache.model === model && cache.range === range) return cache.v;
    const members = model.selected
      .map((id) => model.byId[id])
      .filter((annotation): annotation is ModelAnnotation => !!annotation);
    const fields = sharedFields(members.map((annotation) => kindOf(annotation.annotation)));
    const sources = members.map((annotation) => sourcesOf(model, annotation));
    const values = sources.length ? fieldValues(fields, sources[0]!) : {};
    const mixed: string[] = [];
    for (const spec of fields) {
      const first = JSON.stringify(fieldValue(spec, sources[0]!));
      if (sources.some((source) => JSON.stringify(fieldValue(spec, source)) !== first))
        mixed.push(spec.key);
    }
    // While the editor holds a range in the (sole) selected free text, the
    // range fields report the runs it covers, resolved against the body — the
    // same values `updateSelection` would restyle.
    if (range && members.length === 1 && members[0]!.id === range.id) {
      const rp = rangeProps(richDocOf(fieldsOf(members[0]!), fonts), range, fonts);
      for (const spec of fields) {
        if (!RANGE_KEYS.includes(spec.key)) continue;
        values[spec.key] = rp.values[spec.key];
        const index = mixed.indexOf(spec.key);
        if (index >= 0) mixed.splice(index, 1);
        if (rp.mixed.includes(spec.key)) mixed.push(spec.key);
      }
    }
    const v: EditableFields = { fields, values, mixed };
    cache = { model, range, v };
    return v;
  };

  // The selection's `/F` state — per-flag value, `null` where members disagree.
  let flagsCache: { model: Model; v: SelectionFlags | null } | null = null;
  const selectionFlagsOf = (): SelectionFlags | null => {
    const model = store.model();
    if (flagsCache && flagsCache.model === model) return flagsCache.v;
    const members = model.selected
      .map((id) => model.byId[id])
      .filter((annotation): annotation is ModelAnnotation => !!annotation);
    let flags: SelectionFlags | null = null;
    if (members.length) {
      flags = {} as SelectionFlags;
      for (const key of FLAG_KEYS) {
        const first = members[0].annotation[key];
        flags[key] = members.every((annotation) => annotation.annotation[key] === first)
          ? first
          : null;
      }
    }
    flagsCache = { model, v: flags };
    return flags;
  };

  const api = {
    getSelectionFields: () => selectionFieldsOf(),
    getSelectionFlags: () => selectionFlagsOf(),
  };

  return { activeTextRange, selectionFieldsOf, api };
}

export type SelectionFieldsReads = ReturnType<typeof createSelectionFieldsReads>;

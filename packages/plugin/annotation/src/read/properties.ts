import {
  kindOf,
  linkOf,
  type Model,
  type ModelAnnotation,
  richDocOf,
  sharedProperties,
  textOf,
} from '@embedpdf/core-annotation';

import type { AnnotationProperties } from '../contract';
import { RANGE_KEYS, rangeProps, type TextSelection } from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';
import { propertyValue, propertyValues, type PropertySources } from './property-values';

/**
 * The selection's style-panel properties, flags included, memoized by model
 * identity so a subscribed panel re-renders only when the model changed.
 */
export function createPropertyReads(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, fonts }: Pick<AnnotationServices, 'store' | 'fonts'>,
) {
  /** The editor's text range inside the annotation being edited, or null
   *  (no editor selection, a bare caret, or a selection left behind by a
   *  previous edit). The one condition that routes the range properties to runs. */
  const activeTextRange = (model: Model): TextSelection | null => {
    const ts = ctx.state.get().textSelection;
    return ts && model.editing === ts.id && ts.end > ts.start && model.byId[ts.id] ? ts : null;
  };

  /** What a panel reads of one member: its fields, its text as shown, and its link. */
  const sourcesOf = (model: Model, record: ModelAnnotation): PropertySources => {
    const annotation = record.annotation;
    const text = textOf(annotation);
    return {
      data: annotation as unknown as Record<string, unknown>,
      ...(text ? { text } : {}),
      // Parents store no link: the committed children are the truth, read
      // through the lens. A link annotation reads its own target.
      link: annotation.subtype === 'link' ? (annotation.target ?? null) : linkOf(model, record.id),
    };
  };

  let cache: { model: Model; range: TextSelection | null; v: AnnotationProperties } | null = null;
  const selectionPropertiesOf = (): AnnotationProperties => {
    const model = store.model();
    const range = activeTextRange(model);
    if (cache && cache.model === model && cache.range === range) return cache.v;
    const members = model.selected
      .map((id) => model.byId[id])
      .filter((record): record is ModelAnnotation => !!record);
    const properties = sharedProperties(members.map((record) => kindOf(record.annotation)));
    const sources = members.map((record) => sourcesOf(model, record));
    const values = sources.length ? propertyValues(properties, sources[0]!) : {};
    const mixed: string[] = [];
    for (const spec of properties) {
      const first = JSON.stringify(propertyValue(spec, sources[0]!));
      if (sources.some((source) => JSON.stringify(propertyValue(spec, source)) !== first))
        mixed.push(spec.key);
    }
    // While the editor holds a range in the (sole) selected free text, the
    // range properties report the runs it covers, resolved against the body:
    // the same values `selection.update` would restyle.
    if (range && members.length === 1 && members[0]!.id === range.id) {
      const rp = rangeProps(richDocOf(members[0]!.annotation, fonts), range, fonts);
      for (const spec of properties) {
        if (!RANGE_KEYS.includes(spec.key)) continue;
        values[spec.key] = rp.values[spec.key];
        const index = mixed.indexOf(spec.key);
        if (index >= 0) mixed.splice(index, 1);
        if (rp.mixed.includes(spec.key)) mixed.push(spec.key);
      }
    }
    const v: AnnotationProperties = { properties, values, mixed };
    cache = { model, range, v };
    return v;
  };

  return { activeTextRange, selectionPropertiesOf };
}

export type PropertyReads = ReturnType<typeof createPropertyReads>;

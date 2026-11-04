import {
  type AnnotationProperty,
  isEditableByHand,
  linkOf,
  type Model,
  type ModelAnnotation,
  richDocOf,
  richTextLength,
  selectionProperties,
  textOf,
} from '@embedpdf/core-annotation';

import type { AnnotationProperties } from '../contract';
import {
  caretProps,
  RANGE_KEYS,
  rangeProps,
  type EditorSelection,
  type TextProps,
  type TextSelection,
} from '../rich-text';
import type { AnnotationContext, AnnotationServices } from '../services';
import { propertyValue, propertyValues, type PropertySources } from './property-values';

/**
 * The selection's style-panel properties, flags included, memoized by model
 * identity so a subscribed panel re-renders only when the model changed. Only
 * the members people may change by hand count (the `editable` setting): a
 * selection of frozen annotations has nothing to restyle.
 */
export function createPropertyReads(
  ctx: Pick<AnnotationContext, 'state'>,
  { store, fonts }: Pick<AnnotationServices, 'store' | 'fonts'>,
) {
  /** The editor's selection inside the annotation being edited, or null (no
   *  editor selection, or one left behind by a previous edit). */
  const editorSelection = (model: Model): EditorSelection | null => {
    const ts = ctx.state.get().textSelection;
    return ts && model.editing === ts.id && model.byId[ts.id] ? ts : null;
  };

  /** The editor's text range inside the annotation being edited, or null
   *  (no editor selection, or a bare caret). The one condition that routes
   *  the range properties to runs. */
  const activeTextRange = (model: Model): TextSelection | null => {
    const ts = editorSelection(model);
    return ts && ts.end > ts.start ? ts : null;
  };

  /** The editor's caret inside the annotation being edited, or null. The
   *  range properties there are the text typed next. */
  const activeCaret = (model: Model): EditorSelection | null => {
    const ts = editorSelection(model);
    return ts && ts.end === ts.start ? ts : null;
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

  /**
   * What a free text's range properties read: the text the next change
   * styles. The editor's range, the text typed next at its caret, else all of
   * the box's text. `null` for any other kind.
   */
  const textPropsOf = (model: Model, record: ModelAnnotation): TextProps | null => {
    if (record.annotation.subtype !== 'free-text') return null;
    const doc = richDocOf(record.annotation, fonts);
    const ts = editorSelection(model);
    if (ts?.id !== record.id) return rangeProps(doc, { start: 0, end: richTextLength(doc) }, fonts);
    if (ts.end > ts.start) return rangeProps(doc, ts, fonts);
    return caretProps(doc, ts.start, ts.typing, fonts);
  };

  let cache: {
    model: Model;
    selection: EditorSelection | null;
    v: AnnotationProperties;
  } | null = null;
  const selectionPropertiesOf = (): AnnotationProperties => {
    const model = store.model();
    const selection = editorSelection(model);
    if (cache && cache.model === model && cache.selection === selection) return cache.v;
    const members = model.selected
      .map((id) => model.byId[id])
      .filter(
        (record): record is ModelAnnotation =>
          !!record && isEditableByHand(model, record.annotation),
      );
    const properties = selectionProperties(
      model,
      members.map((record) => record.annotation),
    );
    const sources = members.map((record) => sourcesOf(model, record));
    // A free text's range properties are its text's: what the next change
    // styles reads back, resolved against the body, the same values
    // `selection.update` would restyle.
    const texts = members.map((record) => textPropsOf(model, record));
    const valueOf = (spec: AnnotationProperty, index: number): unknown => {
      const text = texts[index];
      return text && RANGE_KEYS.includes(spec.key)
        ? text.values[spec.key]
        : propertyValue(spec, sources[index]!);
    };
    const values = sources.length ? propertyValues(properties, sources[0]!) : {};
    const mixed: string[] = [];
    for (const spec of properties) {
      const ofText = RANGE_KEYS.includes(spec.key);
      if (ofText && texts[0]) values[spec.key] = texts[0].values[spec.key];
      const first = JSON.stringify(valueOf(spec, 0));
      if (
        sources.some((_, index) => JSON.stringify(valueOf(spec, index)) !== first) ||
        (ofText && texts.some((text) => text?.mixed.includes(spec.key)))
      ) {
        mixed.push(spec.key);
      }
    }
    const result: AnnotationProperties = { properties, values, mixed };
    cache = { model, selection, v: result };
    return result;
  };

  return { activeTextRange, activeCaret, selectionPropertiesOf };
}

export type PropertyReads = ReturnType<typeof createPropertyReads>;

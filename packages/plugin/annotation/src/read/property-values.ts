/**
 * The values a style panel shows for a list of properties: the annotation's
 * (or a tool's defaults') engine fields by name. Three read differently: the
 * border's value is `borderStyle`, `dashArray` and `cloudyIntensity`; a text's
 * font, size, colour, alignment and formats read as the text shows them; and
 * the link is an attached link's target, not a field.
 */
import type { AnnotationProperty, FieldValues, TextStyle } from '@embedpdf/core-annotation';

/** The fields a text shows resolved: a free text's colour follows `color` when it has no `fontColor`. */
const TEXT_KEYS: ReadonlySet<string> = new Set([
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
  'bold',
  'italic',
  'underline',
]);

const FORMATS: ReadonlySet<string> = new Set(['bold', 'italic', 'underline']);

/** What a panel reads beside the engine fields. */
export interface PropertySources {
  /** The engine fields, by name. */
  readonly data: FieldValues;
  /** The text as it shows, for a kind with text. */
  readonly text?: TextStyle;
  /** Where it links to, `null` for nowhere. */
  readonly link?: unknown;
}

/** One property's value, by its key (the border's is its three fields). */
export function propertyValue(
  spec: AnnotationProperty,
  { data, text, link }: PropertySources,
): unknown {
  if (spec.key === 'link') return link ?? null;
  if (spec.key === 'borderStyle') {
    return {
      borderStyle: data.borderStyle ?? 'solid',
      dashArray: data.dashArray ?? null,
      cloudyIntensity: data.cloudyIntensity ?? null,
    };
  }
  if (text && TEXT_KEYS.has(spec.key)) {
    // A format the text doesn't set is off.
    return text[spec.key as keyof TextStyle] ?? (FORMATS.has(spec.key) ? false : undefined);
  }
  return data[spec.key];
}

/** Every property's value, by key: the border spreads into its three fields. */
export function propertyValues(
  properties: readonly AnnotationProperty[],
  sources: PropertySources,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const spec of properties) {
    const value = propertyValue(spec, sources);
    if (spec.key === 'borderStyle') Object.assign(values, value);
    else values[spec.key] = value;
  }
  return values;
}

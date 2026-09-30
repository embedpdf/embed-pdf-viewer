/**
 * The values a style panel shows for a list of fields: the annotation's (or a
 * tool's defaults') engine fields by name. Three read differently: the border
 * picker's value is `borderStyle`, `dashArray` and `cloudyIntensity`; a text's
 * font, size, colour, alignment and formats read as the text shows them; and
 * the link is an attached link's target, not a field.
 */
import type { FieldSpec, FieldValues, TextStyle } from '@embedpdf/core-annotation';

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
export interface FieldSources {
  /** The engine fields, by name. */
  readonly data: FieldValues;
  /** The text as it shows, for a kind with text. */
  readonly text?: TextStyle;
  /** Where it links to, `null` for nowhere. */
  readonly link?: unknown;
}

/** One field's value, by the spec's key (the border's is its three fields). */
export function fieldValue(spec: FieldSpec, { data, text, link }: FieldSources): unknown {
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

/** Every field's value, by name: the border spreads into its three fields. */
export function fieldValues(
  fields: readonly FieldSpec[],
  sources: FieldSources,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const spec of fields) {
    const value = fieldValue(spec, sources);
    if (spec.key === 'borderStyle') Object.assign(values, value);
    else values[spec.key] = value;
  }
  return values;
}

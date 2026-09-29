/**
 * The kind table's editable fields over a selection: which fields a mixed
 * selection shares, and which kinds may carry a link.
 */
import { fieldsFor, type FieldSpec } from './kinds';
import type { TextStyle } from './types';

/** Base text styling for kinds/tools with no explicit defaults. */
export const initialTextStyle: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 14,
  fontColor: '#000000',
  textAlign: 'left',
};

/** Does this kind's field table declare `link` (attachable link)? The link
 *  Kind itself also declares it, but stores its own `/A` instead. */
export const kindTakesLink = (subtype: string): boolean =>
  fieldsFor(subtype).some((spec) => spec.key === 'link');

/**
 * The ordered field specs every given kind declares — the schema for a mixed
 * selection, in the first kind's display order. One kind → its own list, verbatim.
 */
export function sharedFields(subtypes: readonly string[]): FieldSpec[] {
  const unique = [...new Set(subtypes)];
  if (!unique.length) return [];
  const first = fieldsFor(unique[0]);
  if (unique.length === 1) return first;
  const rest = unique
    .slice(1)
    .map((subtype) => new Set(fieldsFor(subtype).map((spec) => spec.key)));
  return first.filter((spec) => rest.every((keys) => keys.has(spec.key)));
}

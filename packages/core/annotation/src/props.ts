/**
 * The kind table's editable fields over a selection: which fields a mixed
 * selection shares, and which kinds may carry a link.
 */
import type { AnnotationKind, FieldSpec } from './kinds';
import type { TextStyle } from './types';

/** Base text styling for kinds/tools with no explicit defaults. */
export const initialTextStyle: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 14,
  fontColor: '#000000',
  textAlign: 'left',
};

/** Does this kind's field table declare `link` (attachable link)? The link
 *  kind itself also declares it, but stores its own `/A` instead. */
export const kindTakesLink = (kind: AnnotationKind): boolean =>
  kind.fields.some((spec) => spec.key === 'link');

/**
 * The ordered field specs every given kind declares — the schema for a mixed
 * selection, in the first kind's display order. One kind → its own list, verbatim.
 */
export function sharedFields(kinds: readonly AnnotationKind[]): readonly FieldSpec[] {
  const unique = [...new Set(kinds)];
  if (!unique.length) return [];
  const first = unique[0]!.fields;
  if (unique.length === 1) return first;
  const rest = unique.slice(1).map((kind) => new Set(kind.fields.map((spec) => spec.key)));
  return first.filter((spec) => rest.every((keys) => keys.has(spec.key)));
}

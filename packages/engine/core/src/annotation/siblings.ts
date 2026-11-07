import { kindFactsOf } from './kind-facts';
import type { AnnotationSubtype } from './subtype';

/**
 * Kinds that take the same fields, so an update turns one into another by its
 * `subtype` and the annotation stays itself. ISO 32000-2 describes each group
 * with one table of entries: the text markup subtypes (12.5.6.10), and Square
 * and Circle (12.5.6.8). Every other kind keeps its subtype.
 */
export const SIBLING_KINDS: readonly (readonly AnnotationSubtype[])[] = [
  ['highlight', 'underline', 'squiggly', 'strikeout'],
  ['square', 'circle'],
];

/** The kinds an annotation of `subtype` can become: the others of its group, or none. */
export function siblingKindsOf(subtype: string): readonly AnnotationSubtype[] {
  const group = SIBLING_KINDS.find((kinds) => kinds.includes(subtype as AnnotationSubtype));
  return group ? group.filter((kind) => kind !== subtype) : [];
}

/**
 * The first field `annotation` holds a value in that the kind `subtype` has
 * no field for, or `null`. A kind change over such a value is refused, never
 * dropped: the caller clears it first, as a replacement's strikeout clears its
 * `intent`.
 */
export function fieldTheKindCannotHold(
  annotation: { readonly subtype: string },
  subtype: string,
): string | null {
  const kept = kindFactsOf(subtype)?.owners ?? {};
  const read = annotation as unknown as Record<string, unknown>;
  for (const name of Object.keys(kindFactsOf(annotation.subtype)?.owners ?? {})) {
    const value = read[name];
    if (!(name in kept) && value !== null && value !== undefined) return name;
  }
  return null;
}

/**
 * Whether an update can turn `annotation` into `subtype` now: a sibling kind
 * (`siblingKindsOf`), with no value it can't hold (`fieldTheKindCannotHold`).
 */
export function canChangeKind(annotation: { readonly subtype: string }, subtype: string): boolean {
  return (
    siblingKindsOf(annotation.subtype).includes(subtype as AnnotationSubtype) &&
    fieldTheKindCannotHold(annotation, subtype) === null
  );
}

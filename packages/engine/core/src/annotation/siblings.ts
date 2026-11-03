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

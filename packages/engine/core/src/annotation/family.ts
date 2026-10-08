/**
 * The two read families a page's `/Annots` splits into: its annotations,
 * every subtype but `/Widget` (`doc.annotations.list()`), and its widgets,
 * which are the form's (`doc.forms.list()`). The subtype alone decides, in
 * the reads, the events, the permissions and the pictures.
 */
export type AnnotationFamily = 'annotations' | 'widgets';

/** The family an annotation of `subtype` belongs to. */
export function familyOfSubtype(subtype: string): AnnotationFamily {
  return subtype === 'widget' ? 'widgets' : 'annotations';
}

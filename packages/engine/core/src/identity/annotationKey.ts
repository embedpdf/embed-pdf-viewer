import type { AnnotationRef } from './AnnotationRef';

/**
 * The string key for an annotation address — for maps, sets and React keys.
 * A ref is an object, and JavaScript keys objects by identity, so two refs
 * that name the same annotation need one canonical value form; this is it.
 * The ref stays the thing you pass to the engine; this is only how you index.
 *
 * The page appears exactly where it carries information:
 *
 *   objectNumber  →  `obj:42`              an indirect object number is unique
 *                                           across the whole document
 *   baseIndex     →  `base:<page>:<i>`      a position in one page's /Annots
 *
 * This agrees with the wire: `obj:42` is the route's `:annotKey`
 * (`encodeAnnotKey`), and a `base` key is the route's `:pageKey` +
 * `:annotKey` folded into one string, because a client-side map has no path
 * segment to keep the page in.
 */
export function annotationKey(ref: AnnotationRef): string {
  switch (ref.kind) {
    case 'objectNumber':
      return `obj:${ref.objectNumber}`;
    case 'baseIndex':
      return `base:${ref.page.objectNumber}:${ref.baseIndex}`;
  }
}

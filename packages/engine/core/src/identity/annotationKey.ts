import type { AnnotationRef } from './AnnotationRef';
import type { AnnotationStableId } from './AnnotationStableId';
import type { PageRef } from './PageRef';

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
 *   nm            →  `nm:<page>:<name>`     ISO 32000 §12.5.2: /NM is unique per
 *                                           page, not per document
 *   index         →  `idx:<page>:<i>`       a weak ref is page-relative by definition
 *
 * For the durable kinds this agrees with the wire: `obj:42` is the route's
 * `:annotKey` (`encodeStableIdKey`), and an `nm` key is the route's
 * `:pageKey` + `:annotKey` folded into one string because a client-side map
 * has no path segment to keep the page in.
 */
export function annotationKey(ref: AnnotationRef): string {
  switch (ref.kind) {
    case 'objectNumber':
      return `obj:${ref.annotObjectNumber}`;
    case 'nm':
      return `nm:${ref.page.pageObjectNumber}:${ref.nm}`;
    case 'index':
      return positionKey(ref.page, ref.index);
  }
}

/**
 * The key of the annotation at this position of a page's `/Annots` array, as
 * a weak ref addresses it. A record carries its position (`dto.index`), so a
 * reader can find the key a weak record had before the engine named it.
 */
export function positionKey(page: PageRef, index: number): string {
  return `idx:${page.pageObjectNumber}:${index}`;
}

/**
 * Rebuild an address from the two halves an event carries separately: the
 * page it happened on and the page-local stable id. The inverse of the
 * cloud client's split into `:pageKey` + `:annotKey`.
 */
export function refFromStableId(page: PageRef, id: AnnotationStableId): AnnotationRef {
  return id.kind === 'objectNumber'
    ? { kind: 'objectNumber', page, annotObjectNumber: id.value }
    : { kind: 'nm', page, nm: id.value };
}

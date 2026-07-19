/**
 * Tri-state knowledge about weak annotation identities on a page.
 *
 * `known(false)` is a stronger claim than "we have not looked yet": it means
 * the page's annotations were scanned and every annotation had a durable
 * identity. Cloud/CDN manifests must only publish boolean weak flags from a
 * known state.
 */
export type WeakAnnotationState =
  | { kind: 'unknown' }
  | { kind: 'known'; hasAnyWeakAnnotations: boolean };

export const UNKNOWN_WEAK_ANNOTATION_STATE: WeakAnnotationState = { kind: 'unknown' };

export function knownWeakAnnotationState(hasAnyWeakAnnotations: boolean): WeakAnnotationState {
  return { kind: 'known', hasAnyWeakAnnotations };
}

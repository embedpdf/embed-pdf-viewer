/**
 * Classification used by clients to decide whether they can hold long-lived
 * references to an annotation.
 *
 * `durable`  - the annotation has a stable wire id (PDF indirect object
 *              number, or `/NM`). References survive structural mutations.
 * `weak`     - the annotation has no stable wire id; the only handle is
 *              `(pageObjectNumber, index, revision)`. Index can shift after
 *              any structural mutation on the same page; the engine encodes
 *              that fact in `AnnotationListMutationMeta.weakRefsInvalidated`.
 */
export type AnnotationIdentityQuality = 'durable' | 'weak';

import type { ReadShape } from './declaration';
import type { annotationBaseFields } from './kinds/shared-fields';

/**
 * The fields every annotation read carries, whatever its kind. Each kind's
 * read extends these with its own fields and its `subtype`. The fields and
 * who writes them are declared in {@link annotationBaseFields}.
 *
 * Relationships are not nested: a reply or a popup is its own annotation in
 * the flat page list, linked by a ref field (`reply.to`, `popup`, a popup's
 * `parent`). `buildThreads()` composes replies into threads.
 */
export type AnnotationBase = ReadShape<typeof annotationBaseFields>;

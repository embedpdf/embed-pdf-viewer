/**
 * What a copy of annotations creates and leaves out, decided before its
 * first write: the copies as {@link planAnnotationCopies} makes them, each
 * checked against its kind's create schema as an import's items are. Built
 * with zod, so it runs where the engine does, from
 * `@embedpdf/engine-core/validation`.
 */
import {
  planAnnotationCopies,
  type AnnotationCopyPlacement,
  type PlannedAnnotationCopy,
} from './annotationCopy';
import {
  fieldMarkersOf,
  type AnnotationDropReason,
  type AnnotationImportDrop,
} from './annotationImport';
import { draftOf, unwritableValuesOf } from './planAnnotationImport';
import type { Annotation, AnnotationDraft } from '../annotation/kinds';

/** One annotation a copy creates. */
export interface PlannedCopyCreate extends Omit<PlannedAnnotationCopy, 'data'> {
  /** What `create` writes: the source's data, moved, without its links and dropped fields. */
  readonly draft: AnnotationDraft;
}

export interface AnnotationCopyCreates {
  /** In the order of the annotations given. */
  readonly creates: readonly PlannedCopyCreate[];
  /** What was left out, whole or one field of it, in the order given. */
  readonly dropped: readonly AnnotationImportDrop[];
}

/**
 * What a copy of `sources` (in page space) creates, and what it leaves out.
 * Nothing here touches a document, so a copy refuses before its first write:
 * `InvalidArg` when a source's data isn't valid for its kind.
 *
 * {@link planAnnotationCopies} leaves a field that marks something the engine
 * can't write out of its copy, and each one is reported here. Beyond that, a
 * source with a value every create of its kind needs and no write can make
 * is left out, and any other field with such a value is left out of its copy.
 */
export function planAnnotationCopy(
  sources: readonly Annotation[],
  placement: AnnotationCopyPlacement,
): AnnotationCopyCreates {
  type Marker = { field: string; reason: AnnotationDropReason };
  const markers = new Map<number, Marker[] | 'item'>();
  sources.forEach((data, index) => {
    if (data.subtype === 'unsupported' || data.subtype === 'widget') return;
    const unwritable = unwritableValuesOf(data);
    markers.set(index, unwritable === 'item' ? 'item' : [...fieldMarkersOf(data), ...unwritable]);
  });
  const fieldsOf = (index: number): Marker[] => {
    const found = markers.get(index);
    return found === undefined || found === 'item' ? [] : found;
  };

  const plan = planAnnotationCopies(sources, placement, (index) => markers.get(index) === 'item');
  const creates = plan.copies.map(
    ({ data, ...copy }): PlannedCopyCreate => ({
      ...copy,
      draft: draftOf(data, fieldsOf(copy.source), (page) => page, {
        label: `copy: annotation ${copy.source}`,
        details: { annotation: copy.source },
      }),
    }),
  );

  // `plan.dropped` lists each source left out whole, in order: every other one is a create.
  const kept = new Set(creates.map((create) => create.source));
  const whole = plan.dropped[Symbol.iterator]();
  const dropped: AnnotationImportDrop[] = [];
  sources.forEach((data, index) => {
    if (!kept.has(index)) dropped.push(whole.next().value!);
    else for (const marker of fieldsOf(index)) dropped.push({ ref: data.ref, ...marker });
  });
  return { creates, dropped };
}

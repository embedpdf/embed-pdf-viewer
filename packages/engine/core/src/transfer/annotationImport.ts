import type { AnnotationBundle } from './AnnotationBundle';
import type { BundleImportPages } from './bundle';
import type { Annotation } from '../annotation/kinds';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';
import type { AnnotationListMutationMeta } from '../mutation/AnnotationListMutationMeta';
import type { AnnotationCreateResult } from '../mutation/AnnotationMutationResults';
import type { WriteOptions } from '../mutation/WriteOptions';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * How to import. The `opId` names the import: its events share it as
 * `origin.tx.id`, and on the cloud a retry with the same id applies once.
 */
export interface AnnotationImportOptions extends WriteOptions {
  /** Default `'same'`. A page an item is on or points at that maps nowhere refuses the import. */
  readonly pages?: BundleImportPages;
  /**
   * `'restore'` (the default) writes the authors, dates and names (`nm`) as
   * the bundle has them, and needs `doc.annotate.import`; an item whose name
   * its page already has is dropped as `'name-conflict'`. `'stamp'` makes
   * copies: it stamps the session and the time, as `create` does, and gives
   * every annotation a fresh name.
   */
  readonly attribution?: 'restore' | 'stamp';
}

/**
 * An import as it travels to a server: the bundle without its bytes (each
 * resource is a part of its own) and the options, apart from the `opId`,
 * which is the request's `Idempotency-Key`.
 */
export interface AnnotationImportBody {
  readonly bundle: Omit<AnnotationBundle, 'resources'>;
  readonly options: Omit<AnnotationImportOptions, 'opId'>;
}

/** Why an import left an annotation, or one of its fields, out. */
export type AnnotationDropReason =
  /** A kind the engine doesn't model (`subtype: 'unsupported'`). */
  | 'unsupported-kind'
  /** A widget, in a field or not: widgets are the form's, and travel with it. */
  | 'widget'
  /** A geospatial measure, which the engine reads only as a marker. */
  | 'geospatial'
  /** A measure of a kind the engine doesn't know, read only as a marker. */
  | 'unknown-measure'
  /**
   * An action a write can't make: a link's target of a kind a write can't
   * make (JavaScript, launch, named, remote go-to), or actions (`/A`, `/AA`)
   * that no field of the kind writes.
   */
  | 'unsupported-action'
  /**
   * A value another app wrote that a write can't make: a shape's beveled or
   * inset border, a typewriter's intent, a polyline of one point. An
   * optional field is left out; an item whose shape it is, is left out.
   */
  | 'unsupported-value'
  /** Its `nm` is used on the target page already, or by an earlier item. */
  | 'name-conflict'
  /** Its `reply.to` or `parent` is an item that was left out. */
  | 'parent-dropped'
  /** Its `reply.to` or `parent` is no item of the bundle on its page. */
  | 'parent-missing'
  /** A popup whose parent has another, an earlier item: an annotation has one popup. */
  | 'popup-taken';

export interface AnnotationImportDrop {
  /** The annotation, as the bundle names it. */
  readonly ref: AnnotationRef;
  /** Set when only this field was left out: the annotation was imported without it. */
  readonly field?: string;
  readonly reason: AnnotationDropReason;
}

export interface AnnotationImportResult<C extends Coordinates = PageCoordinates> {
  /** In bundle order, each as it is now. */
  annotations: Annotation<C>[];
  /** Each imported annotation's ref in the bundle, and its ref in this document. */
  refMap: Array<{ from: AnnotationRef; to: AnnotationRef }>;
  /** What was left out, in bundle order. */
  dropped: AnnotationImportDrop[];
  meta: AnnotationListMutationMeta;
}

/**
 * The facts an import committed: one `annotations.created` per annotation, in
 * bundle order, each with the envelope of its own page and its own id. The
 * cache pins move once, with the last.
 */
export function annotationImportFacts(
  result: AnnotationImportResult,
): Array<{ page: PageRef } & AnnotationCreateResult> {
  const last = result.annotations.length - 1;
  return result.annotations.map((annotation, index) => {
    const { page } = annotation.ref;
    return {
      page,
      annotation,
      meta: {
        affectedPages: result.meta.affectedPages.filter(
          (affected) => affected.objectNumber === page.objectNumber,
        ),
        cacheDelta: index === last ? result.meta.cacheDelta : null,
        opId: result.meta.opId,
        undoable: result.meta.undoable,
        changed: [annotation.ref],
      },
    };
  });
}

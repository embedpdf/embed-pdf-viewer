/**
 * What a copy of annotations is, inside one document: decided here, once.
 * The engine applies it and a viewer shows it before the engine answers, so
 * nothing here needs zod. What only the engine can check (a value a write
 * can't make) it passes in as `unwritable` (`planAnnotationCopy`, in
 * `@embedpdf/engine-core/validation`).
 */
import {
  fieldMarkersOf,
  type AnnotationDropReason,
  type AnnotationImportDrop,
} from './annotationImport';
import { translatedAnnotation } from '../annotation/appearance';
import type { Annotation } from '../annotation/kinds';
import type { AnnotationReplyType } from '../annotation/primitives';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodePageKey, type PageRef } from '../identity/PageRef';
import type { AnnotationListMutationMeta } from '../mutation/AnnotationListMutationMeta';
import type { WriteOptions } from '../mutation/WriteOptions';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/** Where copies go: `doc.annotations.copy(refs, options)`, and the op's own fields. */
export interface AnnotationCopyPlacement {
  /** The page the copies go on. Left out: each on its own page. */
  readonly page?: PageRef;
  /**
   * How far each copy is moved, in page points from the top-left: `x` to the
   * right, `y` down. Left out: not at all.
   */
  readonly offset?: { readonly x: number; readonly y: number };
}

/**
 * How to copy. The `opId` names the change: its events share it as
 * `origin.tx.id`, and `doc.apply({ undoOf })` takes the copies away.
 */
export interface AnnotationCopyOptions extends WriteOptions, AnnotationCopyPlacement {
  /**
   * The object number each copy gets, in the order of the refs, from
   * `doc.objectNumbers`. The next free ones when absent. A number given for
   * an annotation that is left out isn't used.
   */
  readonly objectNumbers?: readonly number[];
}

export interface AnnotationCopyResult<C extends Coordinates = PageCoordinates> {
  /** The copies, in the order of the refs given, each as it is now. */
  annotations: Annotation<C>[];
  /** Each copied annotation's ref, and its copy's. One named twice is here twice. */
  refMap: Array<{ from: AnnotationRef; to: AnnotationRef }>;
  /** What was left out, in the order of the refs given. */
  dropped: AnnotationImportDrop[];
  meta: AnnotationListMutationMeta;
}

/** One copy a plan makes. */
export interface PlannedAnnotationCopy {
  /** The annotation it copies, by its place among the ones given. */
  readonly source: number;
  /** The page the copy goes on. */
  readonly page: PageRef;
  /**
   * What the copy holds: the source's data, moved. Its name, its group and
   * its links are left out: the engine gives it a name and the session's
   * group, and its links are the two fields below. So is a field that marks
   * something the engine can't write (`fieldMarkersOf`). Its `ref` is still
   * the source's.
   */
  readonly data: Annotation;
  /** The copy it replies to or is grouped with, by its place in `copies`. */
  readonly replyTo?: { readonly copy: number; readonly type: AnnotationReplyType };
  /** For a popup: the copy it shows, by its place in `copies`. */
  readonly parent?: number;
}

export interface AnnotationCopyPlan {
  /** In the order of the annotations given. */
  readonly copies: readonly PlannedAnnotationCopy[];
  /** The annotations left out whole, in the order given. */
  readonly dropped: readonly AnnotationImportDrop[];
}

/**
 * The copies of `sources`, which are in page space, in the order given:
 *
 * - A copy carries its source's data, moved by `offset`, on `page` when one
 *   is named: the same spot from the top-left of that page.
 * - A reply to an annotation that is copied too replies to that one's copy,
 *   so a copied group is a group of its own. A reply to any other annotation
 *   stands alone.
 * - A popup comes with the annotation it shows, or not at all.
 * - A field that marks something the engine can't write (a geospatial
 *   measure, an action no write makes) is left out of its copy.
 * - A kind the engine doesn't know, a widget, and a source `unwritable` says
 *   a write can't make, are left out.
 *
 * A source named twice is copied twice; a link to it points at its first copy.
 */
export function planAnnotationCopies(
  sources: readonly Annotation[],
  placement: AnnotationCopyPlacement,
  unwritable: (source: number) => boolean = () => false,
): AnnotationCopyPlan {
  const drops = new Map<number, AnnotationDropReason>();
  sources.forEach((data, index) => {
    if (data.subtype === 'unsupported') drops.set(index, 'unsupported-kind');
    else if (data.subtype === 'widget') drops.set(index, 'widget');
    else if (unwritable(index)) drops.set(index, 'unsupported-value');
  });

  const first = new Map<string, number>();
  sources.forEach((data, index) => {
    const key = annotationKey(data.ref);
    if (!first.has(key)) first.set(key, index);
  });
  const pageOf = (index: number): PageRef => placement.page ?? sources[index]!.ref.page;
  // A reply and a popup are on their parent's page (ISO 32000-2 §12.5.6.2),
  // so a link holds only between copies that land on one page.
  const copied = (ref: AnnotationRef, from: number): number | undefined => {
    const found = first.get(annotationKey(ref));
    if (found === undefined || drops.has(found)) return undefined;
    return encodePageKey(pageOf(found)) === encodePageKey(pageOf(from)) ? found : undefined;
  };

  const popups = new Set<number>();
  sources.forEach((data, index) => {
    if (drops.has(index) || data.subtype !== 'popup') return;
    const named = data.parent ? first.get(annotationKey(data.parent)) : undefined;
    const parent = data.parent ? copied(data.parent, index) : undefined;
    if (parent === undefined) {
      drops.set(
        index,
        named !== undefined && drops.has(named) ? 'parent-dropped' : 'parent-missing',
      );
    } else if (popups.has(parent)) {
      drops.set(index, 'popup-taken');
    } else {
      popups.add(parent);
    }
  });

  const place = new Map<number, number>();
  sources.forEach((_data, index) => {
    if (!drops.has(index)) place.set(index, place.size);
  });
  const offset = placement.offset ?? { x: 0, y: 0 };
  const copies = [...place.keys()].map((index): PlannedAnnotationCopy => {
    const source = sources[index]!;
    const replied = source.reply ? copied(source.reply.to, index) : undefined;
    const parent =
      source.subtype === 'popup' && source.parent ? copied(source.parent, index) : undefined;
    const {
      nm: _name,
      groupId: _group,
      reply: _reply,
      popup: _popup,
      ...data
    } = source as Annotation & { groupId?: unknown };
    for (const { field } of fieldMarkersOf(source)) {
      delete (data as Record<string, unknown>)[field];
    }
    return {
      source: index,
      page: pageOf(index),
      data: translatedAnnotation(data as Annotation, offset),
      ...(replied !== undefined
        ? { replyTo: { copy: place.get(replied)!, type: source.reply!.type } }
        : {}),
      ...(parent !== undefined ? { parent: place.get(parent)! } : {}),
    };
  });

  const dropped: AnnotationImportDrop[] = [];
  sources.forEach((data, index) => {
    const reason = drops.get(index);
    if (reason) dropped.push({ ref: data.ref, reason });
  });
  return { copies, dropped };
}

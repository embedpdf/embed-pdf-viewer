import type { AnnotationBundle } from './AnnotationBundle';
import { bundlePageMapping, type BundleImportPages, type BundleImportTarget } from './bundle';
import { mapPageRefs, pageRefsIn } from './pageRefs';
import {
  AnnotationDraftSchema,
  declarationOf,
  type AnnotationDraft,
  type Annotation,
} from '../annotation/kinds';
import type { KindFields } from '../annotation/declaration';
import type { AnnotationReplyType } from '../annotation/primitives';
import type { PdfActionTree } from '../dto/PdfAction';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodePageKey, type PageRef } from '../identity/PageRef';
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

/** One annotation an import creates. */
export interface PlannedAnnotation {
  /** Its item in the bundle. */
  readonly item: number;
  /** The page it goes on. */
  readonly page: PageRef;
  /** What `create` writes: the item's data, its pages mapped, without its links and dropped fields. */
  readonly draft: AnnotationDraft;
  /** The annotation it replies to, by its place in `creates`. */
  readonly replyTo?: { readonly planned: number; readonly type: AnnotationReplyType };
  /** For a popup: the annotation it shows, by its place in `creates`. */
  readonly parent?: number;
}

export interface AnnotationImportPlan {
  /** In bundle order. */
  readonly creates: readonly PlannedAnnotation[];
  readonly dropped: readonly AnnotationImportDrop[];
}

/**
 * What an import of `bundle` into the `target` pages creates, and what it
 * leaves out. Nothing here touches a document, so an import refuses before
 * its first write:
 *
 * - `InvalidArg` when an item's data isn't valid for its kind, or when a
 *   page an item is on or points at maps to no target page (naming them);
 * - `NotFound` when a page list maps to a page the target doesn't have.
 *
 * Unsupported items and unresolved relationships are left out in this order:
 *
 * 1. an item of an unsupported kind, and a form field's widget; a field
 *    marker leaves out only that field;
 * 2. an item whose `reply.to` or `parent` is no item of the bundle on the
 *    same target page (`parent-missing`);
 * 3. an item whose name is used on its target page, or by an earlier item
 *    going to the same page (`name-conflict`);
 * 4. then, until nothing changes, an item whose `reply.to` or `parent` was
 *    left out (`parent-dropped`), so a whole branch goes together.
 *
 * `nameTaken(page, nm)` answers for the target page as it is before the import.
 */
export function planAnnotationImport(input: {
  readonly bundle: Pick<AnnotationBundle, 'pages' | 'items'>;
  readonly pages?: BundleImportPages;
  readonly target: readonly BundleImportTarget[];
  readonly nameTaken: (page: PageRef, nm: string) => boolean;
}): AnnotationImportPlan {
  const { bundle, target, nameTaken } = input;
  const items = bundle.items.map((item) => item.data);
  const mapPage = bundlePageMapping({
    bundlePages: bundle.pages,
    pages: input.pages ?? 'same',
    target,
    named: items.flatMap(pagesNamedBy),
  });

  const drops = new Map<number, AnnotationDropReason>();
  const fieldDrops = new Map<number, Array<{ field: string; reason: AnnotationDropReason }>>();
  const drafts = new Map<number, AnnotationDraft>();
  items.forEach((data, index) => {
    if (data.subtype === 'unsupported') {
      drops.set(index, 'unsupported-kind');
      return;
    }
    if (data.subtype === 'widget') {
      drops.set(index, 'widget');
      return;
    }
    // A popup shows another annotation; one that names none can't be made.
    if (data.subtype === 'popup' && data.parent === null) {
      drops.set(index, 'parent-missing');
      return;
    }
    const unwritable = unwritableValuesOf(data);
    if (unwritable === 'item') {
      drops.set(index, 'unsupported-value');
      return;
    }
    const markers = [...fieldMarkersOf(data), ...unwritable];
    if (markers.length > 0) fieldDrops.set(index, markers);
    drafts.set(index, draftOf(data, markers, mapPage, index));
  });

  const byKey = new Map<string, number>();
  items.forEach((data, index) => {
    const key = annotationKey(data.ref);
    if (!byKey.has(key)) byKey.set(key, index);
  });
  // A reply and a popup are on their parent's page (ISO 32000-2 §12.5.6.2),
  // so a link finds its target only there.
  const pageOf = (index: number) => encodePageKey(mapPage(items[index]!.ref.page));
  const resolve = (ref: AnnotationRef, from: number) => {
    const found = byKey.get(annotationKey(ref));
    return found !== undefined && pageOf(found) === pageOf(from) ? found : undefined;
  };
  const linksOf = (data: Annotation) =>
    [data.reply?.to, data.subtype === 'popup' ? data.parent : null].filter(
      (ref): ref is AnnotationRef => ref != null,
    );

  items.forEach((data, index) => {
    if (drops.has(index)) return;
    if (linksOf(data).some((ref) => resolve(ref, index) === undefined)) {
      drops.set(index, 'parent-missing');
    }
  });

  const popupOf = new Map<number, number>();
  items.forEach((data, index) => {
    if (drops.has(index) || data.subtype !== 'popup' || !data.parent) return;
    const parent = resolve(data.parent, index)!;
    if (popupOf.has(parent)) drops.set(index, 'popup-taken');
    else popupOf.set(parent, index);
  });

  const claimed = new Set<string>();
  items.forEach((data, index) => {
    if (drops.has(index) || !data.nm) return;
    const page = mapPage(data.ref.page);
    const claim = `${encodePageKey(page)}\u0000${data.nm}`;
    if (claimed.has(claim) || nameTaken(page, data.nm)) drops.set(index, 'name-conflict');
    else claimed.add(claim);
  });

  for (let changed = true; changed; ) {
    changed = false;
    items.forEach((data, index) => {
      if (drops.has(index)) return;
      if (linksOf(data).some((ref) => drops.has(resolve(ref, index)!))) {
        drops.set(index, 'parent-dropped');
        changed = true;
      }
    });
  }

  const planned = new Map<number, number>();
  items.forEach((_data, index) => {
    if (!drops.has(index)) planned.set(index, planned.size);
  });
  const creates: PlannedAnnotation[] = [...planned.keys()].map((index) => {
    const data = items[index]!;
    const replyTo = data.reply ? planned.get(resolve(data.reply.to, index)!) : undefined;
    const parent =
      data.subtype === 'popup' && data.parent
        ? planned.get(resolve(data.parent, index)!)
        : undefined;
    return {
      item: index,
      page: mapPage(data.ref.page),
      draft: drafts.get(index)!,
      ...(replyTo !== undefined ? { replyTo: { planned: replyTo, type: data.reply!.type } } : {}),
      ...(parent !== undefined ? { parent } : {}),
    };
  });

  const dropped: AnnotationImportDrop[] = [];
  items.forEach((data, index) => {
    const reason = drops.get(index);
    if (reason) dropped.push({ ref: data.ref, reason });
    else for (const drop of fieldDrops.get(index) ?? []) dropped.push({ ref: data.ref, ...drop });
  });
  return { creates, dropped };
}

/**
 * The pages an item is on or points at, apart from its links to other
 * annotations (`reply.to`, `parent`, `popup`), which resolve in the bundle.
 */
function pagesNamedBy(data: Annotation): PageRef[] {
  const { ref, reply: _reply, popup: _popup, ...rest } = data;
  const fields = { ...rest } as Record<string, unknown>;
  if (data.subtype === 'popup') delete fields.parent;
  return [ref.page, ...pageRefsIn(fields)];
}

/** The fields of `data` that are markers for something the engine can't write. */
function fieldMarkersOf(data: Annotation): Array<{ field: string; reason: AnnotationDropReason }> {
  const markers: Array<{ field: string; reason: AnnotationDropReason }> = [];
  const measure = (data as { measure?: { subtype?: unknown } | null }).measure;
  if (measure?.subtype === 'geospatial') markers.push({ field: 'measure', reason: 'geospatial' });
  if (measure?.subtype === 'unknown') markers.push({ field: 'measure', reason: 'unknown-measure' });
  const target = data.subtype === 'link' ? data.target : null;
  const carriedTarget = !!target && isWritableLinkTarget(target);
  if (target && !carriedTarget) markers.push({ field: 'target', reason: 'unsupported-action' });
  // `actions` reads `/A` and `/AA`, and no write takes it. A copy has only
  // the `/A` a link's target writes: one go-to or URI action, without a
  // chain or an `/IsMap`. A target a write can't make is reported above.
  const { actions } = data;
  const lost = Object.entries(actions ?? {}).some(([trigger, tree]) =>
    data.subtype !== 'link' || trigger !== 'activate' ? true : carriedTarget && !writtenAsIs(tree),
  );
  if (lost) markers.push({ field: 'actions', reason: 'unsupported-action' });
  return markers;
}

/**
 * The values `data` reads that a write can't make (a `readBack()` field's
 * read-only values), each left out; `'item'` when one is a field every
 * create needs. A link's target is reported by {@link fieldMarkersOf}.
 */
function unwritableValuesOf(
  data: Annotation,
): Array<{ field: string; reason: AnnotationDropReason }> | 'item' {
  const unwritable: Array<{ field: string; reason: AnnotationDropReason }> = [];
  const declaration = declarationOf(data.subtype);
  for (const [name, spec] of Object.entries(declaration?.fields ?? {})) {
    const { owner, readBack, required } = spec.traits;
    if (owner !== 'data' || !readBack || name === 'target') continue;
    const value = (data as unknown as Record<string, unknown>)[name];
    if (value == null || spec.write.safeParse(value).success) continue;
    if (required) return 'item';
    unwritable.push({ field: name, reason: 'unsupported-value' });
  }
  return unwritable;
}

/** Whether a link's `/A` is what writing its target writes again. */
function writtenAsIs<Destination>(tree: PdfActionTree<Destination> | undefined): boolean {
  const root = tree?.root;
  if (!tree || tree.incomplete || !root || root.next.length > 0) return false;
  return !(root.type === 'uri' && root.isMap);
}

/** Whether a write can make a link's target; the others read as markers. */
function isWritableLinkTarget(target: { kind: string; name?: string }): boolean {
  return target.kind === 'named'
    ? STANDARD_NAMED_ACTIONS.has(target.name ?? '')
    : target.kind === 'goto' || target.kind === 'uri';
}

const STANDARD_NAMED_ACTIONS: ReadonlySet<string> = new Set([
  'NextPage',
  'PrevPage',
  'FirstPage',
  'LastPage',
]);

/** The create an item becomes, checked against its kind's create schema. */
function draftOf(
  data: Annotation,
  markers: ReadonlyArray<{ field: string }>,
  mapPage: (page: PageRef) => PageRef,
  index: number,
): AnnotationDraft {
  const fields = { ...data } as Record<string, unknown>;
  delete fields.reply;
  // Left out, the field is not written: `null` where a write takes it,
  // else the kind's default.
  const declared: KindFields = declarationOf(data.subtype)?.fields ?? {};
  for (const { field } of markers) {
    if (declared[field]?.traits.writeNullable) fields[field] = null;
    else delete fields[field];
  }
  // Checked with the popup's `parent`, which the import then links itself.
  const checked = AnnotationDraftSchema.safeParse(fields);
  if (data.subtype === 'popup') delete fields.parent;
  if (!checked.success) {
    const issue = checked.error.issues[0]!;
    const path = issue.path.join('.');
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `import: item ${index}${path ? ` field '${path}'` : ''}: ${issue.message}`,
      { details: { item: index, ...(path ? { field: path } : {}) } },
    );
  }
  // The item's own data, not the schema's output, so nothing a read carries
  // is reshaped on its way back in.
  return mapPageRefs(fields, mapPage) as AnnotationDraft;
}

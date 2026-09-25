import {
  EngineError,
  EngineErrorCode,
  PDF_SUBTYPE_TO_CODE,
  type AnnotationActor,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationListMutationMeta,
  type AnnotationRef,
  type AnnotationReplyType,
  type AnnotationStableId,
  type PageObjectNumber,
  type PageRef,
  type RevisionToken,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { captureOrStampStableId } from './internal/identity/captureOrStampStableId';
import { resolveAnnotIndexRaw } from './internal/identity/resolveAnnotIndexRaw';
import { prepareCreate } from './internal/mutations/prepareCreate';
import { annotationIndexByName } from './internal/read/annotationIndexByName';
import { readContextFor } from './internal/read/annotationReadContext';
import { readAnnotString } from './internal/read/annotationReadPrimitives';
import { joinWidgetFieldNumbers } from './internal/read/joinWidgetField';
import { readAnnotationFromPtr } from './internal/read/readAnnotationFromPtr';
import type { AnnotationWriteContext } from './internal/write/annotationWriteContext';
import { applyDraft } from './internal/write/annotationWriterRegistry';
import { generateAppearance } from './internal/write/generateAppearance';
import { restoreAttribution, type RestoredAttribution } from './internal/write/restoreAttribution';
import { stampCreation } from './internal/write/stampCreation';
import { linkPopup, linkReply } from './internal/write/writeAnnotationRelationship';
import { DocumentCheckpoint } from '../../document-session/DocumentCheckpoint';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';

/**
 * What a link points at: another create of the same change, by its place in
 * it, so creates can refer to each other before any exists; or an annotation
 * the document has.
 */
export type BatchLinkTarget = { readonly planned: number } | { readonly existing: AnnotationRef };

/** One create of a change. */
export interface BatchCreate {
  /** The page it goes on. */
  readonly page: PageRef;
  /** Its data, without its links, which are the two fields below. */
  readonly draft: AnnotationDraft;
  /** `reply`: the annotation it replies to, on the same page. */
  readonly replyTo?: { readonly to: BatchLinkTarget; readonly type: AnnotationReplyType };
  /** For a popup: the annotation it shows, on the same page. */
  readonly parent?: BatchLinkTarget;
  /** The bytes beside the draft, by role. */
  readonly resources?: WireAnnotationResources;
  /**
   * Who wrote the annotation, and when: the session now, as `create`
   * stamps it, or the attribution it already had, restored as it is.
   */
  readonly attribution:
    | { readonly kind: 'stamp'; readonly actor?: AnnotationActor }
    | {
        readonly kind: 'restore';
        readonly from: RestoredAttribution;
        /** The importing session's user, recorded as `importedBy`. */
        readonly importedBy?: string;
      };
  /** Names the create in an error, such as `import: item 3`. */
  readonly label?: string;
}

export interface BatchCreateResult {
  /** In the order of the creates, each as it is now. */
  created: AnnotationDTO[];
  meta: AnnotationListMutationMeta;
}

/** Where a created annotation is: enough to open it again without loading its page. */
interface Placed {
  readonly pageIndex: number;
  readonly pageObjectNumber: PageObjectNumber;
  readonly index: number;
  readonly objectNumber: number;
}

/** An annotation the document has, which a create links to: its place in its page's `/Annots`. */
interface Existing {
  readonly pageIndex: number;
  readonly index: number;
}

/**
 * Applies a change set as one unit (the change-sets plan, §4.1): every item
 * is checked before the first write, the writes run inside a
 * {@link DocumentCheckpoint}, and any failure, an abort included, returns
 * the document to where it was. Today it takes creates, which is what an
 * import is; update, delete and restore join it later.
 *
 * No page is loaded or parsed. Each annotation is made on a raw handle
 * (`EPDFPage_CreateAnnotRaw`) and opened again the same way, by its place in
 * its page's `/Annots`, for each pass:
 *
 * 1. create every annotation in order, so each page's `/Annots` keeps it,
 *    with its data and its appearance;
 * 2. link replies and popups to what they name: another create, or an
 *    annotation the document has, recorded before a write to it (a weak
 *    one is named first, so the link has a durable address);
 * 3. attribute each, stamped as the session or restored as it was, last,
 *    so no later write touches `/M`.
 */
export class AnnotationBatchApplier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry: FreeText faces by key. */
    private readonly fonts?: FontRegistrar,
  ) {}

  create(creates: readonly BatchCreate[], signal: AbortSignal): BatchCreateResult {
    throwIfAborted(signal);
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const claimed = new Set<string>();
    const prepared = creates.map((create) => {
      const record = this.session.resolvePageRef(create.page);
      const ctx = this.writeContext(create.resources);
      const draft = labelled(create.label, () =>
        prepareCreate(create.draft, create.resources, ctx),
      );
      labelled(create.label, () => this.claimName(draft.nm, record, claimed));
      const replyTo = create.replyTo && {
        type: create.replyTo.type,
        to: labelled(create.label, () =>
          this.linkTarget(create.replyTo!.to, create.page, creates.length, 'reply'),
        ),
      };
      const parent =
        create.parent &&
        labelled(create.label, () =>
          this.linkTarget(create.parent!, create.page, creates.length, 'popup'),
        );
      return { create, record, ctx, draft, replyTo, parent };
    });
    throwIfAborted(signal);
    if (prepared.length === 0) return { created: [], meta: metaOf(this.session, [], []) };

    const checkpoint = DocumentCheckpoint.begin(fn, docPtr);
    try {
      const placed = prepared.map(({ create, record, ctx, draft }): Placed => {
        throwIfAborted(signal);
        checkpoint.page(record.pageIndex);
        const annotPtr = fn.EPDFPage_CreateAnnotRaw(
          docPtr,
          record.pageIndex,
          PDF_SUBTYPE_TO_CODE[draft.subtype],
        );
        if (!annotPtr) {
          throw new EngineError(
            EngineErrorCode.Unknown,
            `${create.label ?? 'create'}: EPDFPage_CreateAnnotRaw returned NULL`,
          );
        }
        let objectNumber: number;
        try {
          labelled(create.label, () => applyDraft(fn, mem, annotPtr, draft, ctx));
          generateAppearance(fn, annotPtr, draft.blendMode);
          objectNumber = fn.EPDFAnnot_GetObjectNumber(annotPtr);
          if (objectNumber <= 0) {
            throw new EngineError(
              EngineErrorCode.Unknown,
              `${create.label ?? 'create'}: EPDFPage_CreateAnnotRaw made a direct object`,
            );
          }
        } finally {
          fn.FPDFPage_CloseAnnot(annotPtr);
        }
        return {
          pageIndex: record.pageIndex,
          pageObjectNumber: record.pageObjectNumber,
          index: fn.EPDFPage_GetAnnotCountRaw(docPtr, record.pageIndex) - 1,
          objectNumber,
        };
      });

      // Parents that are already in the document, strengthened by a link.
      const linked: AnnotationStableId[] = [];
      const openTarget = <T>(target: number | Existing, body: (parentPtr: Ptr) => T): T => {
        if (typeof target === 'number') return this.withOpen(placed[target]!, body);
        return this.withOpenExisting(target, (parentPtr) => {
          linked.push(captureOrStampStableId(this.runtime, parentPtr));
          return body(parentPtr);
        });
      };
      prepared.forEach(({ replyTo, parent }, at) => {
        if (replyTo) {
          this.withOpen(placed[at]!, (annotPtr) =>
            openTarget(replyTo.to, (parentPtr) =>
              linkReply(this.runtime, annotPtr, parentPtr, replyTo.type),
            ),
          );
        }
        if (parent !== undefined) {
          this.withOpen(placed[at]!, (popupPtr) =>
            openTarget(parent, (parentPtr) => {
              // The parent gets a /Popup: one the document had is recorded first.
              const number = fn.EPDFAnnot_GetObjectNumber(parentPtr);
              if (number > 0) checkpoint.object(number);
              linkPopup(this.runtime, popupPtr, parentPtr);
            }),
          );
        }
      });

      const now = new Date();
      prepared.forEach(({ create: { attribution, label } }, at) => {
        this.withOpen(placed[at]!, (annotPtr) =>
          labelled(label, () =>
            attribution.kind === 'stamp'
              ? stampCreation(fn, mem, annotPtr, attribution.actor, now)
              : restoreAttribution(fn, mem, annotPtr, attribution.from, attribution.importedBy),
          ),
        );
      });

      const readCtx = readContextFor(this.session, this.fonts);
      const revisions = new Map<PageObjectNumber, RevisionToken>();
      const created = placed.map((at) => {
        let revision = revisions.get(at.pageObjectNumber);
        if (revision === undefined) {
          revision = this.session.pageState(at.pageObjectNumber).revision;
          revisions.set(at.pageObjectNumber, revision);
        }
        return this.withOpen(at, (annotPtr) =>
          readAnnotationFromPtr(
            fn,
            mem,
            annotPtr,
            at.pageObjectNumber,
            at.index,
            revision,
            readCtx,
          ),
        );
      });
      joinWidgetFieldNumbers(this.runtime, this.session, created);
      this.knowWeakAnnotations(placed, linked.length > 0);
      return { created, meta: metaOf(this.session, placed, linked) };
    } catch (error) {
      checkpoint.rollback();
      // The rollback freed the numbers the new drawings had.
      this.session.drawingIndex().forget();
      throw error;
    } finally {
      checkpoint.end();
    }
  }

  /**
   * A name must be free on its page (ISO 32000-2 §12.5.2): not used there,
   * and not by an earlier create of the change.
   */
  private claimName(
    nm: string | null | undefined,
    record: { pageIndex: number; pageObjectNumber: PageObjectNumber },
    claimed: Set<string>,
  ): void {
    if (!nm) return;
    const claim = `${record.pageIndex}\u0000${nm}`;
    const docPtr = this.session.requireDocPtr();
    if (
      claimed.has(claim) ||
      annotationIndexByName(this.runtime, docPtr, record.pageIndex, nm) >= 0
    ) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `nm '${nm}' is already used on page ${record.pageObjectNumber}`,
        { details: { field: 'nm' } },
      );
    }
    claimed.add(claim);
  }

  /**
   * A link's target, checked before the first write: another create of the
   * change, or an annotation the document has, on the same page (ISO
   * 32000-2 §12.5.6.2). Creates only append, so its place holds.
   */
  private linkTarget(
    target: BatchLinkTarget,
    page: PageRef,
    count: number,
    link: 'reply' | 'popup',
  ): number | Existing {
    if ('planned' in target) {
      if (target.planned < 0 || target.planned >= count) {
        throw new EngineError(EngineErrorCode.InvalidArg, `no create ${target.planned} to link to`);
      }
      return target.planned;
    }
    const { existing } = target;
    if (existing.page.pageObjectNumber !== page.pageObjectNumber) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        link === 'reply'
          ? `/IRT parent must be on the same page as the reply (parent page ${existing.page.pageObjectNumber}, reply page ${page.pageObjectNumber})`
          : `a popup's parent must be on the same page (parent page ${existing.page.pageObjectNumber}, popup page ${page.pageObjectNumber})`,
      );
    }
    return resolveAnnotIndexRaw(this.runtime, this.session, existing);
  }

  /**
   * Keep each touched page's weak-annotation state known: read raw where it
   * isn't known yet, or where a link may have strengthened a weak parent.
   * New annotations are durable, so they never make a page weak.
   */
  private knowWeakAnnotations(placed: readonly Placed[], strengthened: boolean): void {
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pages = new Map(placed.map((at) => [at.pageObjectNumber, at.pageIndex]));
    for (const [pageObjectNumber, pageIndex] of pages) {
      if (!strengthened && this.session.weakAnnotationState(pageObjectNumber).kind === 'known') {
        continue;
      }
      let weak = false;
      const count = fn.EPDFPage_GetAnnotCountRaw(docPtr, pageIndex);
      for (let index = 0; index < count && !weak; index++) {
        const annotPtr = fn.EPDFPage_GetAnnotRaw(docPtr, pageIndex, index);
        if (!annotPtr) continue;
        try {
          weak =
            fn.EPDFAnnot_GetObjectNumber(annotPtr) <= 0 &&
            !readAnnotString(fn, mem, annotPtr, 'NM');
        } finally {
          fn.FPDFPage_CloseAnnot(annotPtr);
        }
      }
      this.session.recordWeakFlag(pageObjectNumber, weak);
    }
  }

  private writeContext(resources?: WireAnnotationResources): AnnotationWriteContext {
    const fonts = this.fonts;
    return {
      ...(fonts
        ? {
            resolveRegisteredFontId: (key: string) => fonts.idFor(key),
            describeRegisteredFont: (key: string) => fonts.describeOrUndefined(key),
          }
        : {}),
      docPtr: this.session.requireDocPtr(),
      drawings: this.session.drawingIndex(),
      ...(resources ? { resources } : {}),
    };
  }

  // A created annotation, opened again from its page's /Annots; nothing
  // else writes to the document during the change, so its place holds.
  private withOpen<T>(at: Placed, body: (annotPtr: Ptr) => T): T {
    const { fn } = this.runtime;
    const annotPtr = fn.EPDFPage_GetAnnotRaw(this.session.requireDocPtr(), at.pageIndex, at.index);
    if (!annotPtr) {
      throw new EngineError(EngineErrorCode.Unknown, 'a created annotation is not where it was');
    }
    try {
      if (fn.EPDFAnnot_GetObjectNumber(annotPtr) !== at.objectNumber) {
        throw new EngineError(EngineErrorCode.Unknown, 'a created annotation is not where it was');
      }
      return body(annotPtr);
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  // An annotation the document has; creates only append, so its place holds.
  private withOpenExisting<T>(at: Existing, body: (annotPtr: Ptr) => T): T {
    const { fn } = this.runtime;
    const annotPtr = fn.EPDFPage_GetAnnotRaw(this.session.requireDocPtr(), at.pageIndex, at.index);
    if (!annotPtr) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        'an annotation to link to is not where it was',
      );
    }
    try {
      return body(annotPtr);
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }
}

/**
 * One envelope for the change: each page it touched, each annotation it made,
 * and each it linked to and strengthened. Creates only append, so no
 * revision moves and no weak ref goes stale.
 */
function metaOf(
  session: DocumentSession,
  placed: readonly Placed[],
  linked: readonly AnnotationStableId[],
): AnnotationListMutationMeta {
  const pages = [...new Set(placed.map((at) => at.pageObjectNumber))];
  return {
    affectedPages: pages.map((page) => session.pageState(page)),
    cacheDelta: null,
    changed: [
      ...placed.map((at): AnnotationStableId => ({ kind: 'objectNumber', value: at.objectNumber })),
      ...linked,
    ],
    weakRefsInvalidated: false,
    shouldRefetch: null,
  };
}

/** Run `body`, naming `label`, when there is one, in the typed error it throws. */
function labelled<T>(label: string | undefined, body: () => T): T {
  try {
    return body();
  } catch (error) {
    if (!label || !EngineError.is(error)) throw error;
    throw new EngineError(error.code, `${label}: ${error.message}`, {
      ...(error.details ? { details: error.details } : {}),
      cause: error,
    });
  }
}

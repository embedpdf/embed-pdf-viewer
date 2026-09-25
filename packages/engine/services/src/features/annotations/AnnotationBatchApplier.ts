import {
  EngineError,
  EngineErrorCode,
  PDF_SUBTYPE_TO_CODE,
  type AnnotationActor,
  type AnnotationDTO,
  type AnnotationListMutationMeta,
  type AnnotationStableId,
  type PageObjectNumber,
  type PlannedAnnotation,
  type RevisionToken,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { prepareCreate } from './internal/mutations/prepareCreate';
import { readContextFor } from './internal/read/annotationReadContext';
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
 * One create of a change. Its links name other creates of the same change
 * by their place in it, so creates can refer to each other before any
 * exists.
 */
export interface BatchCreate extends Pick<
  PlannedAnnotation,
  'page' | 'draft' | 'replyTo' | 'parent'
> {
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
  readonly label: string;
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
 * 2. link replies and popups to the creates they name;
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
    const prepared = creates.map((create) => {
      const record = this.session.resolvePageRef(create.page);
      const ctx = this.writeContext(create.resources);
      const draft = labelled(create.label, () =>
        prepareCreate(create.draft, create.resources, ctx),
      );
      return { create, record, ctx, draft };
    });
    throwIfAborted(signal);
    if (prepared.length === 0) return { created: [], meta: metaOf(this.session, []) };

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
            `${create.label}: EPDFPage_CreateAnnotRaw returned NULL`,
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
              `${create.label}: EPDFPage_CreateAnnotRaw made a direct object`,
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

      prepared.forEach(({ create }, at) => {
        const { replyTo, parent } = create;
        if (replyTo) {
          this.withOpen(placed[at]!, (annotPtr) =>
            this.withOpen(placed[replyTo.planned]!, (parentPtr) =>
              linkReply(this.runtime, annotPtr, parentPtr, replyTo.type),
            ),
          );
        }
        if (parent !== undefined) {
          this.withOpen(placed[at]!, (popupPtr) =>
            this.withOpen(placed[parent]!, (parentPtr) =>
              linkPopup(this.runtime, popupPtr, parentPtr),
            ),
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
      return { created, meta: metaOf(this.session, placed) };
    } catch (error) {
      checkpoint.rollback();
      // The rollback freed the numbers the new drawings had.
      this.session.drawingIndex().forget();
      throw error;
    } finally {
      checkpoint.end();
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
}

/**
 * One envelope for the change: each page it touched, and each annotation.
 * Creates only append, so no revision moves and no weak ref goes stale.
 */
function metaOf(session: DocumentSession, placed: readonly Placed[]): AnnotationListMutationMeta {
  const pages = [...new Set(placed.map((at) => at.pageObjectNumber))];
  return {
    affectedPages: pages.map((page) => session.pageState(page)),
    cacheDelta: null,
    changed: placed.map(
      (at): AnnotationStableId => ({ kind: 'objectNumber', value: at.objectNumber }),
    ),
    weakRefsInvalidated: false,
    shouldRefetch: null,
  };
}

/** Run `body`, naming `label` in the typed error it throws. */
function labelled<T>(label: string, body: () => T): T {
  try {
    return body();
  } catch (error) {
    if (!EngineError.is(error)) throw error;
    throw new EngineError(error.code, `${label}: ${error.message}`, {
      ...(error.details ? { details: error.details } : {}),
      cause: error,
    });
  }
}

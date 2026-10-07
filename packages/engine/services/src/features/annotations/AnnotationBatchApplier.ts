import {
  EngineError,
  EngineErrorCode,
  PDF_SUBTYPE_TO_CODE,
  generateUuidV7,
  toPageRef,
  type AnnotationActor,
  type AnnotationDraft,
  type Annotation,
  type AnnotationListMutationMeta,
  type AnnotationRef,
  type AnnotationReplyType,
  type AttachmentFileInfo,
  type PageObjectNumber,
  type PageRef,
  type WireAnnotationResources,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { pdfPageCountOf } from './internal/write/stampDrawing';
import { annotationRefOf } from './internal/identity/annotationName';
import { resolveAnnotIndexRaw } from './internal/identity/resolveAnnotIndexRaw';
import { prepareCreate } from './internal/mutations/prepareCreate';
import { annotationIndexByName } from './internal/read/annotationIndexByName';
import { readContextFor } from './internal/read/annotationReadContext';
import { joinWidgetFieldNumbers } from './internal/read/joinWidgetField';
import { readAnnotationFromPtr } from './internal/read/readAnnotationFromPtr';
import type { AnnotationWriteContext } from './internal/write/annotationWriteContext';
import { applyDraft } from './internal/write/annotationWriterRegistry';
import { generateAppearance } from './internal/write/generateAppearance';
import {
  restoreAttribution,
  restoreFileDates,
  type RestoredAttribution,
} from './internal/write/restoreAttribution';
import { stampCreation } from './internal/write/stampCreation';
import { linkPopup, linkReply } from './internal/write/writeAnnotationRelationship';
import {
  objectNumberUnavailable,
  type DocumentSession,
  type WriteStamp,
} from '../../document-session/DocumentSession';
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
  readonly draft: AnnotationDraft<PdfCoordinates>;
  /** `reply`: the annotation it replies to, on the same page. */
  readonly replyTo?: { readonly to: BatchLinkTarget; readonly type: AnnotationReplyType };
  /** For a popup: the annotation it shows, on the same page. */
  readonly parent?: BatchLinkTarget;
  /** The bytes beside the draft, by role. */
  readonly resources?: WireAnnotationResources;
  /** The object number it gets; the next free one when absent. */
  readonly objectNumber?: number;
  /**
   * Who wrote the annotation, and when: the session now, as `create`
   * stamps it, or the attribution it already had, restored as it is. A
   * stamped one is a new annotation: without an `nm` in its data it gets a
   * fresh UUIDv7 name. A restored one keeps the name it had, or none.
   */
  readonly attribution:
    | { readonly kind: 'stamp'; readonly actor?: AnnotationActor }
    | {
        readonly kind: 'restore';
        readonly from: RestoredAttribution;
        /** The importing session's user, recorded as `importedBy`. */
        readonly importedBy?: string;
      };
  /** A copied file attachment's file dates, kept in either attribution. */
  readonly fileDates?: Pick<AttachmentFileInfo, 'createdAt' | 'modifiedAt'>;
  /** Names the create in an error, such as `import: item 3`. */
  readonly label?: string;
}

export interface BatchCreateResult {
  /** In the order of the creates, each as it is now. */
  created: Annotation<PdfCoordinates>[];
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
  readonly page: PageRef;
  readonly pageIndex: number;
  readonly index: number;
}

/**
 * Applies a change set as one unit: every item is checked before the first
 * write, and the writes run inside the job's layer transaction, so any
 * failure, an abort included, leaves the document as it was. It currently
 * applies annotation creates for imports.
 *
 * No page is loaded or parsed. Each annotation is made on a raw handle
 * (`EPDFPage_CreateAnnotRaw`) and opened again the same way, by its place in
 * its page's `/Annots`, for each pass:
 *
 * 1. create every annotation in order, so each page's `/Annots` keeps it,
 *    with its data and its appearance;
 * 2. link replies and popups to what they name: another create, or an
 *    annotation the document has (one born inline becomes an object, which
 *    a link needs, and keeps its name);
 * 3. attribute each, stamped as the session or restored as it was, last,
 *    so no later write touches `/M`.
 *
 * A create that names its object number makes the annotation at exactly
 * that number: one the session holds, checked before the first write, and
 * free in the layer, which the create itself checks.
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
      const given = labelled(create.label, () =>
        prepareCreate(create.draft, create.resources, ctx),
      );
      labelled(create.label, () => this.claimName(given.nm, record, claimed));
      // A fresh name is never taken: no claim needed.
      const draft =
        given.nm || create.attribution.kind !== 'stamp'
          ? given
          : { ...given, nm: generateUuidV7() };
      if (create.objectNumber !== undefined) {
        labelled(create.label, () => this.session.useObjectNumber(create.objectNumber!));
      }
      const replyTo = create.replyTo && {
        type: create.replyTo.type,
        to: labelled(create.label, () =>
          this.linkTarget(create.replyTo!.to, create.page, creates.length, 'reply'),
        ),
      };
      if (draft.subtype === 'popup' && !create.parent) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `${create.label ?? 'create'}: a popup needs the annotation it shows (parent)`,
          { details: { field: 'parent' } },
        );
      }
      const parent =
        create.parent &&
        labelled(create.label, () =>
          this.linkTarget(create.parent!, create.page, creates.length, 'popup'),
        );
      return { create, record, ctx, draft, replyTo, parent };
    });
    throwIfAborted(signal);
    if (prepared.length === 0) return { created: [], meta: metaOf(this.session.writeStamp(), [], []) };

    const placed = prepared.map(({ create, record, ctx, draft }): Placed => {
      throwIfAborted(signal);
      const annotPtr = fn.EPDFPage_CreateAnnotRaw(
        docPtr,
        record.pageIndex,
        PDF_SUBTYPE_TO_CODE[draft.subtype],
        create.objectNumber ?? 0, // 0: the next free one
      );
      // The page and subtype were checked: a numbered create refused is a
      // number another object has.
      if (!annotPtr && create.objectNumber !== undefined) {
        throw objectNumberUnavailable(create.objectNumber, 'taken');
      }
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

    // A reply writes only itself. A popup's parent gains its `/Popup`: one
    // the document has already is named in the change too.
    const linked: AnnotationRef[] = [];
    const openTarget = <T>(target: number | Existing, body: (parentPtr: Ptr) => T): T =>
      typeof target === 'number'
        ? this.withOpen(placed[target]!, body)
        : this.withOpenExisting(target, body);
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
            linkPopup(this.runtime, popupPtr, parentPtr);
            if (typeof parent === 'number') return;
            linked.push(annotationRefOf(fn, mem, docPtr, parent.page, parentPtr, parent.index));
          }),
        );
      }
    });

    const now = new Date();
    prepared.forEach(({ create: { attribution, fileDates, label } }, at) => {
      this.withOpen(placed[at]!, (annotPtr) =>
        labelled(label, () => {
          if (attribution.kind === 'stamp') {
            stampCreation(fn, mem, annotPtr, attribution.actor, now);
          } else {
            restoreAttribution(fn, mem, annotPtr, attribution.from, attribution.importedBy);
          }
          if (fileDates) restoreFileDates(fn, mem, annotPtr, fileDates);
        }),
      );
    });

    const readCtx = readContextFor(this.session, this.fonts);
    const created = placed.map((at) =>
      this.withOpen(at, (annotPtr) =>
        readAnnotationFromPtr(fn, mem, annotPtr, at.pageObjectNumber, at.index, readCtx),
      ),
    );
    joinWidgetFieldNumbers(this.runtime, this.session, created);
    return { created, meta: metaOf(this.session.writeStamp(), placed, linked) };
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
    if (existing.page.objectNumber !== page.objectNumber) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        link === 'reply'
          ? `/IRT parent must be on the same page as the reply (parent page ${existing.page.objectNumber}, reply page ${page.objectNumber})`
          : `a popup's parent must be on the same page (parent page ${existing.page.objectNumber}, popup page ${page.objectNumber})`,
      );
    }
    return { page: existing.page, ...resolveAnnotIndexRaw(this.runtime, this.session, existing) };
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
      pdfPageCount: (bytes) => pdfPageCountOf(this.runtime.fn, this.runtime.mem, bytes),
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
 * and each it linked a popup to. Creates only append, so no other annotation
 * moves.
 */
function metaOf(
  stamp: WriteStamp,
  placed: readonly Placed[],
  linked: readonly AnnotationRef[],
): AnnotationListMutationMeta {
  const pages = [...new Set(placed.map((at) => at.pageObjectNumber))];
  return {
    affectedPages: pages.map((page) => toPageRef(page)),
    cacheDelta: null,
    ...stamp,
    changed: [
      ...placed.map(
        (at): AnnotationRef => ({
          kind: 'objectNumber',
          page: toPageRef(at.pageObjectNumber),
          objectNumber: at.objectNumber,
        }),
      ),
      ...linked,
    ],
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

import {
  ANNOTATION_RESOURCE_ROLES,
  DEFAULT_BUNDLE_LIMITS,
  EngineError,
  EngineErrorCode,
  annotationKey,
  pageAnnotationOf,
  pdfAnnotationDraftOf,
  type Annotation,
  type AnnotationActor,
  type AnnotationCopyResult,
  type AnnotationDraft,
  type AnnotationRef,
  type PageRef,
  type PdfCoordinates,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import { planAnnotationCopy } from '@embedpdf/engine-core/validation';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { AnnotationBatchApplier, type BatchCreate } from './AnnotationBatchApplier';
import { openAnnotRaw } from './internal/identity/resolveAnnotIndexRaw';
import {
  appearanceBytesOf,
  attachedFileBytesOf,
  isTooLarge,
} from './internal/read/annotationResourceBytes';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';

export interface AnnotationCopyRequest {
  readonly refs: readonly AnnotationRef[];
  /** The page the copies go on; each on its own page when absent. */
  readonly page?: PageRef;
  /** How far each copy moves, in page points from the top-left. */
  readonly offset?: { readonly x: number; readonly y: number };
  /** The object number each copy gets, in the order of `refs`. */
  readonly objectNumbers?: readonly number[];
  /** The annotation `ref` names, as it reads now; `NotFound` when there is none. */
  readonly read: (ref: AnnotationRef) => Annotation<PdfCoordinates>;
  /**
   * Checks each annotation the copy will create, before anything is
   * written: what its create would need. A refusal refuses the copy. It
   * answers who the copy is attributed to, as `create` stamps it.
   */
  readonly authorizeCreate: (draft: AnnotationDraft<PdfCoordinates>) => AnnotationActor | undefined;
}

/** The largest attached file a copy carries: what an export carries. */
const MAX_FILE_BYTES = DEFAULT_BUNDLE_LIMITS.resourceBytes;

/**
 * `doc.annotations.copy`: copies of this document's annotations, created as
 * one change. Each source is read raw and measured from the top-left of its
 * page, `planAnnotationCopy` works out the copies and what to leave out,
 * each copy is measured back on the page it goes to, and
 * {@link AnnotationBatchApplier} writes them, all or nothing, as an import's.
 * Every create is checked before the first write.
 *
 * A stamp's drawing and an attachment's file are read from the source here
 * and never leave the engine. The drawing index places a drawing the document
 * has again, so a copied stamp adds no second drawing. No page is loaded.
 */
export class AnnotationCopier {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry: FreeText faces by key. */
    private readonly fonts?: FontRegistrar,
  ) {}

  copy(request: AnnotationCopyRequest, signal: AbortSignal): AnnotationCopyResult<PdfCoordinates> {
    throwIfAborted(signal);
    const { refs, objectNumbers } = request;
    if (objectNumbers && objectNumbers.length !== refs.length) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `copy: objectNumbers names ${objectNumbers.length} copies of ${refs.length}`,
        { details: { field: 'objectNumbers' } },
      );
    }
    // A page the document doesn't have refuses the copy before anything is read.
    if (request.page) this.session.resolvePageRef(request.page);

    const sources = refs.map((ref) => request.read(ref));
    const boxOf = visibleBoxReader(this.runtime, this.session);
    const plan = planAnnotationCopy(
      sources.map((source) => pageAnnotationOf(source, boxOf(source.ref.page), boxOf)),
      {
        ...(request.page ? { page: request.page } : {}),
        ...(request.offset ? { offset: request.offset } : {}),
      },
    );

    const resources = this.resourceReader();
    const creates = plan.creates.map((planned): BatchCreate => {
      throwIfAborted(signal);
      const source = sources[planned.source]!;
      const draft = pdfAnnotationDraftOf(planned.draft, boxOf(planned.page), boxOf);
      const actor = request.authorizeCreate(draft);
      return {
        page: planned.page,
        draft,
        ...(planned.replyTo
          ? { replyTo: { to: { planned: planned.replyTo.copy }, type: planned.replyTo.type } }
          : {}),
        ...(planned.parent !== undefined ? { parent: { planned: planned.parent } } : {}),
        resources: resources(source),
        ...(objectNumbers ? { objectNumber: objectNumbers[planned.source]! } : {}),
        attribution: { kind: 'stamp', ...(actor ? { actor } : {}) },
        ...(source.subtype === 'file-attachment' && source.file
          ? {
              fileDates: {
                createdAt: source.file.createdAt,
                modifiedAt: source.file.modifiedAt,
              },
            }
          : {}),
        label: `copy: annotation ${planned.source}`,
      };
    });
    const { created, meta } = new AnnotationBatchApplier(
      this.runtime,
      this.session,
      this.fonts,
    ).create(creates, signal);

    return {
      annotations: created,
      refMap: plan.creates.map((planned, at) => ({
        from: sources[planned.source]!.ref,
        to: created[at]!.ref,
      })),
      dropped: [...plan.dropped],
      meta,
    };
  }

  /**
   * Reads the bytes a source carries, by role. A drawing is read once however
   * many copies place it, so the drawing index hashes it once.
   */
  private resourceReader(): (source: Annotation<PdfCoordinates>) => WireAnnotationResources {
    const { fn } = this.runtime;
    const drawings = new Map<number, ArrayBuffer>();
    return (source) => {
      const roles = ANNOTATION_RESOURCE_ROLES[source.subtype];
      if (!roles) return {};
      const annotPtr = openAnnotRaw(this.runtime, this.session, source.ref);
      try {
        const found: WireAnnotationResources = {};
        if (roles.appearance) {
          const drawing = fn.EPDFAnnot_GetStampDrawing(annotPtr);
          const bytes =
            drawings.get(drawing) ??
            appearanceBytesOf(this.runtime, this.session.requireDocPtr(), annotPtr, drawing);
          if (bytes) found.appearance = bytes;
          if (bytes && drawing) drawings.set(drawing, bytes);
        }
        if (roles.file) {
          const bytes = this.fileOf(annotPtr);
          if (bytes) found.file = bytes;
        }
        return found;
      } finally {
        fn.FPDFPage_CloseAnnot(annotPtr);
      }
    };
  }

  private fileOf(annotPtr: Ptr): ArrayBuffer | null {
    try {
      return attachedFileBytesOf(this.runtime, annotPtr, MAX_FILE_BYTES);
    } catch (error) {
      if (!isTooLarge(error)) throw error;
      throw new EngineError(
        EngineErrorCode.PayloadTooLarge,
        `copy: an attached file is larger than ${MAX_FILE_BYTES} bytes`,
        { details: { limit: 'resourceBytes', max: MAX_FILE_BYTES } },
      );
    }
  }
}

import type { DocumentActionsService } from './DocumentActionsService';
import type { DocumentAnnotationsService } from './DocumentAnnotationsService';
import type { DocumentAttachmentsService } from './DocumentAttachmentsService';
import type { DocumentFormsService } from './DocumentFormsService';
import type { DocumentPagesService } from './DocumentPagesService';
import type { DocumentRedactionService } from './DocumentRedactionService';
import type { DocumentRenderService } from './DocumentRenderService';
import type { DocumentSearchService } from './DocumentSearchService';
import type { DocumentSecurityService } from './DocumentSecurityService';
import type { DocumentSignaturesService } from './DocumentSignaturesService';
import type { MetadataService } from './MetadataService';
import type { PageHandle } from './PageHandle';
import type { DownloadOptions } from '../dto/PdfSaveMode';
import type { DocumentEventStream } from '../events/DocumentEventStream';
import type { PageRef } from '../identity/PageRef';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface DocumentCapabilities {
  readonly weakAnnotationEditSessions: 'not-needed' | 'required';
}

/**
 * A document an engine opened: the same on every engine. What only the local
 * engine can do lives on `LocalDocumentHandle` (see `isLocalDocument`).
 */
export interface DocumentHandle {
  readonly id: string;
  readonly capabilities: DocumentCapabilities;
  readonly security: DocumentSecurityService;
  readonly metadata: MetadataService;
  readonly annotations: DocumentAnnotationsService;
  /** Lazy catalog-owned action extraction. The engine never executes scripts. */
  readonly actions: DocumentActionsService;
  /**
   * Document-level attachments (the catalog's `/EmbeddedFiles` name tree).
   * Files attached to annotations are read via
   * `page(ref).annotations.downloadResource(ref, 'file')`.
   */
  readonly attachments: DocumentAttachmentsService;
  /** The document's interactive form (AcroForm): fields, values, interchange. */
  readonly forms: DocumentFormsService;
  /** Document text search: budgeted, cursor-resumable slices. */
  readonly search: DocumentSearchService;
  /**
   * Render policy surface (`doc.render.getPolicy()`): the engine's render
   * lattice, or `continuous` on engines that render any viewport exactly
   * (the local engine). Pixels stay on `page(ref).render` — this carries
   * policy only. Conformance is explicit via `snapFullPageViewport`; no
   * engine ever snaps a render call implicitly.
   */
  readonly render: DocumentRenderService;
  /**
   * Document-scoped page service. Use for cross-page operations:
   *   - `pages.list()` for the current display order.
   *   - `pages.move(refs, toIndex)` for reorder.
   *
   * Per-page reads/writes still live on `page(ref).annotations`.
   */
  readonly pages: DocumentPagesService;
  /**
   * Destructive redaction apply (the second stage of the two-stage model;
   * marking rides the normal annotation verbs).
   */
  readonly redaction: DocumentRedactionService;
  /**
   * Digital signatures: the read side (revisions, signed fields, the
   * protection they impose) and the two-phase signing protocol.
   */
  readonly signatures: DocumentSignaturesService;
  /**
   * The document's event stream — every confirmed mutation, exactly once,
   * identical shape on local and cloud engines (see `DocumentEvent`). The
   * engine-instance identity lives on each event's `origin.sessionId`.
   */
  readonly events: DocumentEventStream;
  /**
   * A handle for the page `ref` names: an address with the page's verbs,
   * made without asking the engine anything (so synchronous). The page is
   * looked up when a call runs; a page the document doesn't have fails that
   * call with `NotFound`. It carries no page data: `pages.list()` does.
   */
  page(ref: PageRef): PageHandle;
  download(options?: DownloadOptions): AbortablePromise<Uint8Array>;
  close(): AbortablePromise<void>;
}

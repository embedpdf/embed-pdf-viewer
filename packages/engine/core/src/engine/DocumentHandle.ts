import type { DocumentActionsService } from './DocumentActionsService';
import type { DocumentAnnotationsService } from './DocumentAnnotationsService';
import type { DocumentAttachmentsService } from './DocumentAttachmentsService';
import type { DocumentFormsService } from './DocumentFormsService';
import type { DocumentPagesService } from './DocumentPagesService';
import type { DocumentRedactionService } from './DocumentRedactionService';
import type { DocumentRenderService } from './DocumentRenderService';
import type { DocumentSearchService } from './DocumentSearchService';
import type { DocumentSecurityService } from './DocumentSecurityService';
import type { MetadataService } from './MetadataService';
import type { PageHandle } from './PageHandle';
import type { PieceInfoService } from './PieceInfoService';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import type { DocumentEventStream } from '../events/DocumentEventStream';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface DocumentCapabilities {
  readonly weakAnnotationEditSessions: 'not-needed' | 'required';
  readonly pageEditSessions: 'unsupported' | 'supported';
}

export interface DocumentHandle {
  readonly id: string;
  readonly capabilities: DocumentCapabilities;
  readonly security: DocumentSecurityService;
  readonly metadata: MetadataService;
  readonly annotations: DocumentAnnotationsService;
  /** Lazy catalog-owned action extraction. The engine never executes scripts. */
  readonly actions?: DocumentActionsService;
  /**
   * Document-level attachments (the catalog's `/EmbeddedFiles` name tree).
   * Optional while transports ship (the `downloadLayer?` pattern) —
   * feature-detect with `doc.attachments !== undefined`. Files attached to
   * annotations are downloaded via `page(pon).annotations.downloadFile`.
   */
  readonly attachments?: DocumentAttachmentsService;
  /** The document's interactive form (AcroForm): fields, values, interchange. */
  readonly forms: DocumentFormsService;
  /**
   * CATALOG-level `/PieceInfo` private application data (ISO 32000 §14.5)
   * — e.g. a stamp library's display name. Optional: the local engine
   * implements it; the cloud engine omits it until a cloud consumer ships
   * (the `downloadLayer?` pattern). Per-page piece data lives on
   * `page(pon).pieceInfo`.
   */
  readonly pieceInfo?: PieceInfoService;
  /** Document text search: budgeted, cursor-resumable slices. */
  readonly search: DocumentSearchService;
  /**
   * Render POLICY surface (`doc.render.policy()`): the engine's render
   * lattice, or `continuous` on engines that render any viewport exactly
   * (the local engine). Pixels stay on `page(pon).render` — this carries
   * policy only. Conformance is explicit via `snapViewportToPolicy`; no
   * engine ever snaps a render call implicitly. Optional while engines
   * ship it — feature-detect with `doc.render !== undefined`.
   */
  readonly render?: DocumentRenderService;
  /**
   * Document-scoped page service. Use for cross-page operations:
   *   - `pages.list()` for the current display order.
   *   - `pages.move(pons, destIndex)` for reorder.
   *
   * Per-page reads/writes still live on `page(pon).annotations`.
   */
  readonly pages: DocumentPagesService;
  /**
   * Destructive redaction apply (the second stage of the two-stage model;
   * marking rides the normal annotation verbs). Optional while engines
   * ship it — feature-detect with `doc.redaction !== undefined`.
   */
  readonly redaction?: DocumentRedactionService;
  /**
   * The document's event stream — every confirmed mutation, exactly once,
   * identical shape on local and cloud engines (see `DocumentEvent`). The
   * engine-instance identity lives on each event's `origin.sessionId`.
   */
  readonly events: DocumentEventStream;
  /**
   * Returns a handle scoped to a page by PDF indirect object number.
   * Throws `EngineError(NotFound)` if the document has no such page.
   * Synchronous because page records are cached on `DocumentSession`.
   */
  page(pageObjectNumber: PageObjectNumber): PageHandle;
  download(opts?: { mode?: PdfSaveMode }): AbortablePromise<Uint8Array>;
  /**
   * Export JUST this document's LAYER as a self-contained artifact (the small
   * overlay diff over the immutable base) — re-openable later via
   * `OpenInputLayerBytes` with `{ kind: 'artifact', bytes }`. Optional: only the
   * local engine, opened WITH a layer (`layerBytes`), supports it; the cloud
   * engine manages layers server-side and omits it. Rejects if the document was
   * opened without a layer.
   */
  downloadLayer?(): AbortablePromise<Uint8Array>;
  close(): AbortablePromise<void>;
}

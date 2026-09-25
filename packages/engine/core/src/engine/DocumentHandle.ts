import type { DocumentActionsService } from './DocumentActionsService';
import type { DocumentAnnotationsService } from './DocumentAnnotationsService';
import type { DocumentAttachmentsService } from './DocumentAttachmentsService';
import type { DocumentFontSettings } from './DocumentFontSettings';
import type { DocumentFormsService } from './DocumentFormsService';
import type { DocumentPagesService } from './DocumentPagesService';
import type { DocumentRedactionService } from './DocumentRedactionService';
import type { DocumentRenderService } from './DocumentRenderService';
import type { DocumentSearchService } from './DocumentSearchService';
import type { DocumentSecurityService } from './DocumentSecurityService';
import type { DocumentSignaturesService } from './DocumentSignaturesService';
import type { MetadataService } from './MetadataService';
import type { PageHandle } from './PageHandle';
import type { PieceInfoService } from './PieceInfoService';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import type { DocumentEventStream } from '../events/DocumentEventStream';
import type { PageRef } from '../identity/PageRef';
import type { BaseVersionInfo } from '../signature/types';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface DocumentCapabilities {
  readonly weakAnnotationEditSessions: 'not-needed' | 'required';
}

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
  /**
   * Font embedding and text layout settings of this document (session
   * state). Optional: the local engine implements it; engines that do not
   * lay text out in-process omit it — feature-detect with
   * `doc.fonts !== undefined`.
   */
  readonly fonts?: DocumentFontSettings;
  /**
   * Catalog-level `/PieceInfo` private application data (ISO 32000 §14.5)
   * — e.g. a stamp library's display name. Optional: the local engine
   * implements it; the cloud engine omits it until a cloud consumer ships
   * (the `downloadLayer?` pattern). Per-page piece data lives on
   * `page(pon).pieceInfo`.
   */
  readonly pieceInfo?: PieceInfoService;
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
   *   - `pages.move(refs, destIndex)` for reorder.
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
  download(opts?: { mode?: PdfSaveMode }): AbortablePromise<Uint8Array>;
  /**
   * Local Node engines only: write the document to a local file without
   * moving its bytes through JS. An untouched session (no unsaved edits,
   * incremental mode) is streamed out verbatim — for a signed document,
   * exactly as sealed. Absent on engines that cannot reach a filesystem.
   */
  downloadToFile?(path: string, opts?: { mode?: PdfSaveMode }): AbortablePromise<void>;
  /**
   * The saved version this session is on: SHA-256 and length of the
   * loaded bytes (for a layer session, of its base). Changes only when
   * a signature completes. Optional while engines ship it.
   */
  version?(): AbortablePromise<BaseVersionInfo>;
  /**
   * Export just this document's layer as a self-contained artifact (the small
   * overlay diff over the immutable base) — re-openable later via
   * `OpenInputLayerBytes` with `{ kind: 'artifact', bytes }`. Optional: the
   * local engine supports it for every session it opens as a layer (the
   * default `sessionKind`, and any `layerBytes` open); the cloud engine
   * manages layers server-side and omits it. Rejects on a session opened
   * with `sessionKind: 'plain'`.
   */
  downloadLayer?(): AbortablePromise<Uint8Array>;
  close(): AbortablePromise<void>;
}

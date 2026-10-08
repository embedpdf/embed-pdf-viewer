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
import type { ObjectNumberPool } from '../identity/ObjectNumbers';
import type { PageRef } from '../identity/PageRef';
import type { Change, ChangeResult } from '../mutation/Change';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';
import type { CallFacts, WorkingSetPage } from '../scheduling/facts';

/**
 * A document an engine opened: the same on every engine. What only the local
 * engine can do lives on `LocalDocumentHandle` (see `isLocalDocument`).
 */
export interface DocumentHandle {
  readonly id: string;
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
   *   - `pages.reorder(refs, position)` for reorder.
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
   * This session's reserved object numbers: take one to name an object
   * before creating it (`page.annotations.create(data, { objectNumber })`,
   * `pages.insertBlank(spec, position, { objectNumbers })`, `forms.create`,
   * `forms.addWidget`). Its ref is then known at once and stays its name
   * for life. Creates without a number still work; the engine picks one.
   */
  readonly objectNumbers: ObjectNumberPool;
  /**
   * A handle for the page `ref` names: an address with the page's verbs,
   * made without asking the engine anything (so synchronous). The page is
   * looked up when a call runs; a page the document doesn't have fails that
   * call with `NotFound`. It carries no page data: `pages.list()` does.
   */
  page(ref: PageRef): PageHandle;
  /**
   * Apply one change, as one transaction: its ops in order, all of them or
   * none (`{ ops }`), or the reverse of an earlier write (`{ undoOf: opId }`).
   * Put everything one user action does into one change; it is one audit
   * row, one burst of events and one undo step. An undo applies where the
   * document still shows what the write set, and its items list what it left
   * alone (`skipped`). Its own result is undoable: that is redo.
   */
  apply(change: Change, options?: WriteOptions): AbortablePromise<ChangeResult>;
  /**
   * The same document, every call made through it carrying `facts`: whether
   * a person waits on it, and the view it serves (see {@link CallFacts}). Most
   * calls need none. The local engine ranks the jobs it runs by them; the
   * cloud engine sends every call as it's made, so it ignores them.
   */
  with(facts: CallFacts): DocumentHandle;
  /**
   * What `view` shows of the document. The local engine ranks the jobs for
   * those pages by it, ranking again whatever waits each time a set arrives,
   * and keeps the pages it shows parsed longest. Each call replaces the view's
   * last set; an empty set withdraws it. A hint: it changes no result. The
   * cloud engine ignores it.
   */
  setWorkingSet(view: string, pages: readonly WorkingSetPage[]): void;
  download(options?: DownloadOptions): AbortablePromise<Uint8Array>;
  close(): AbortablePromise<void>;
}

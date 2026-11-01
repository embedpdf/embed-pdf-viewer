import type { DocumentActionsService } from './DocumentActionsService';
import type { DocumentAnnotationsService } from './DocumentAnnotationsService';
import type { DocumentAttachmentsService } from './DocumentAttachmentsService';
import type { DocumentFontsService } from './DocumentFontsService';
import type { DocumentFormsService } from './DocumentFormsService';
import type { DocumentOutlineService } from './DocumentOutlineService';
import type { DocumentPagesService } from './DocumentPagesService';
import type { DocumentRedactionService } from './DocumentRedactionService';
import type { DocumentRenderService } from './DocumentRenderService';
import type { DocumentSearchService } from './DocumentSearchService';
import type { DocumentSecurityService } from './DocumentSecurityService';
import type { DocumentSignaturesService } from './DocumentSignaturesService';
import type { MetadataService } from './MetadataService';
import type { PageHandle } from './PageHandle';
import type { DownloadOptions } from '../dto/PdfSaveMode';
import type { GrantOpenRequest, VisitorAnswers, VisitorIdentityRequest } from '../dto/GrantVisitor';
import type { DocumentEventStream } from '../events/DocumentEventStream';
import type { ObjectNumberPool } from '../identity/ObjectNumbers';
import type { PageRef } from '../identity/PageRef';
import type { Change, ChangeResult } from '../mutation/Change';
import type { WriteOptions } from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';
import type { CallFacts, WorkingSetPage } from '../scheduling/facts';

/**
 * A document opened from a grant: how it reaches its layer, and who the
 * visitor is. A grant that asks before the first change lets the visitor
 * read at once; their changes wait for their answers. A passphrase or
 * questions on open that the grant gets while the document is open are asked
 * then (`openRequest`), and the document goes on once given.
 */
export interface DocumentGrant {
  /** `'shared'`: everyone with the grant works in one layer. `'per-visitor'`: this visitor's own. */
  readonly layerMode: 'shared' | 'per-visitor';
  /**
   * This browser comes back as this visitor on the next visit, with their answers and, on a
   * per-visitor grant, their layer. False only where the grant gives every visit a new copy.
   */
  readonly keep: boolean;
  /**
   * What the grant asks before this visitor's first change, while they
   * haven't answered it; `null` when nothing is asked.
   */
  readonly identityRequest: VisitorIdentityRequest | null;
  /**
   * Answer what the grant asks. An answer once given stays: a visitor who
   * mistyped starts over (`open({ kind: 'grant', grant, restart: true })`).
   * The changes waiting for the answers go out. Rejects with
   * `VisitorIdentityRequired` while something required is missing or an
   * answer can't be taken (its `details` say which), and the changes keep
   * waiting.
   */
  identify(answers: VisitorAnswers): AbortablePromise<void>;
  /**
   * Called when a change waits for the visitor's answers: show the grant's
   * questions, then `identify` or `decline`. A change made while nothing
   * listens doesn't wait: it fails with `VisitorIdentityRequired`. Returns
   * the unsubscriber.
   */
  onIdentityRequest(listener: (request: VisitorIdentityRequest) => void): () => void;
  /** Not now: the changes waiting fail with `VisitorIdentityRequired`, and the next one asks again. */
  decline(): void;
  /**
   * What the grant asks before this open can go on: a passphrase, or questions asked on open,
   * that the grant got after it opened. `null` while nothing is. The document reads on until its
   * session runs out, then its requests wait for `resume`.
   */
  readonly openRequest: GrantOpenRequest | null;
  /**
   * Called when the grant asks before this open can go on: show its passphrase or questions,
   * then `resume`, or close the document. Returns the unsubscriber.
   */
  onOpenRequest(listener: (request: GrantOpenRequest) => void): () => void;
  /**
   * Give the grant what it asks (`openRequest`): the same visitor goes on, and the requests
   * waiting go out. Rejects with `GrantPassphraseRequired` or `VisitorIdentityRequired` while it
   * still asks, and `openRequest` says what.
   */
  resume(given: {
    readonly passphrase?: string;
    /** The visitor's answers to what the grant asks on open. */
    readonly identity?: VisitorAnswers;
  }): AbortablePromise<void>;
}

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
  /** The fonts that can be named in the document, what each allows, and their programs. */
  readonly fonts: DocumentFontsService;
  /** The document's outline (`/Root /Outlines`, the bookmarks): its items, read and written. */
  readonly outline: DocumentOutlineService;
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
   * identical shape on local and cloud engines (see `DocumentEvent`). Each
   * open is its own session, named on each event's `origin.sessionId`.
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
   * A document opened from a grant (`open({ kind: 'grant' })`): how it
   * reaches its layer, and the visitor's answers to what the grant asks;
   * absent otherwise. A UI shows "Your copy" for a per-visitor layer, "Start
   * over" when the browser keeps it, and the grant's questions when a change
   * waits for them.
   */
  readonly grant?: DocumentGrant;
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

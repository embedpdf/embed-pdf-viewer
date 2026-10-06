import {
  EngineError,
  EngineErrorCode,
  isValidPageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import type {
  DocumentVersionRef,
  PageObjectNumber,
  SignatureCompleteResult,
  PdfCoordinates,
  SignaturePrepared,
  SignedDocumentPolicy,
} from '@embedpdf/engine-core/runtime';
import type { PageRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { DrawingIndex } from './DrawingIndex';
import {
  openFatMemoryDocument,
  type DocumentSource,
  type OpenedPdfDocument,
  type OpenedPdfDocumentKind,
} from './lifecycle/PdfDocumentOpener';
import { PagePtrPool } from './pages/PagePtrPool';
import type { PageRecord } from './pages/PageRecord';
import type { PageResidency } from './pages/PageResidency';

/**
 * Owns the lifecycle of a single open PDFium document and the
 * identity machinery: page registry (pageObjectNumber <-> pageIndex) and
 * `PagePtrPool` (refcounted pagePtr access).
 *
 * Both the local browser Worker and the server worker_thread instantiate
 * this exactly the same way; the only thing that differs is the
 * underlying PdfRuntimeModule (WASM vs native).
 */
/**
 * A serialised signing candidate: the sealed-to-be file with the
 * zero-filled /Contents hole, either as one buffer in JS memory (the local
 * engine) or as a file beside the session's base (the server), plus where
 * the signature value object lies in it.
 */
export type SavedCandidate =
  | { kind: 'memory'; bytes: Uint8Array; size: number; objectOffset: number; objectLength: number }
  | { kind: 'file'; path: string; size: number; objectOffset: number; objectLength: number };

/**
 * A sealed-to-be candidate parked on a session between `prepare` and
 * `complete`/`abort`. The native candidate documents are closed as soon as
 * the seal is computed; only the serialised candidate remains.
 */
export interface PendingSigning {
  readonly prepared: SignaturePrepared;
  readonly fieldObjectNumber: number;
  readonly saved: SavedCandidate;
  readonly contentsOffset: number;
  readonly contentsHexLength: number;
}

/** What a completed signing left behind, for idempotent replays. */
export interface SigningCompletion {
  readonly signingId: string;
  readonly cms: Uint8Array;
  readonly result: SignatureCompleteResult<PdfCoordinates>;
}

export class DocumentSession {
  private docPtr: Ptr | null = null;
  private closeDocument: (() => void) | null = null;
  private _kind: OpenedPdfDocumentKind | null = null;
  private _source: DocumentSource | null = null;
  private readonly _sessionId: string;

  /** pon -> record */
  private readonly recordsByObjectNumber = new Map<PageObjectNumber, PageRecord>();
  /** pageIndex -> record */
  private readonly recordsByIndex = new Map<number, PageRecord>();
  private fullyEnumerated = false;

  /** Bumped by {@link invalidateDerived}: the version caches built from the document key on. */
  private cacheSeqCounter = 0;
  /** Bumped by {@link noteEdit}: one per committed write, never inside or for an abort. */
  private editsSeqCounter = 0;
  /** The open layer transaction, if any (see {@link beginTransaction}). */
  private transaction: { readonly docPtr: Ptr } | null = null;
  /** Why the session can't be used anymore, after a transaction neither committed nor aborted. */
  private unusableReason: string | null = null;
  private pages: PagePtrPool | null = null;
  /**
   * The runtime's parsed pages, kept between jobs. Set before the document
   * loads; without it every page closes when its last holder releases it.
   */
  residency: PageResidency | null = null;
  /**
   * Whether writers honour what the document's signatures forbid (locked
   * fields, structural edits). Set at open from the engine option; the
   * main-thread guard subtracts the matching capabilities.
   */
  signedDocumentPolicy: SignedDocumentPolicy = 'protect';
  /** The password the document was opened with; signing candidates open with the same one. */
  password: string | null = null;
  /**
   * Whether mutations on a layer session also serialize the layer artifact
   * into their response (what a server persists). False for a session opened
   * from bytes (`WorkerHost.openBytesAsLayer`): the caller holds the document
   * and never asked for artifacts.
   */
  persistLayerArtifact = true;
  /** The edits sequence the current bytes were loaded at (see `hasUnsavedEdits`). */
  private loadedSeq = 0;
  /** SHA-256 (hex) of a plain session's loaded bytes, hashed once per load. */
  private plainSha256: { loadedSeq: number; sha256: string } | null = null;
  /** The signing candidate parked by `signatures.prepare`, if any. */
  pendingSigning: PendingSigning | null = null;
  /** The last completed signing, so a replayed `complete` answers `already-completed`. */
  lastCompletion: SigningCompletion | null = null;
  /** The stamp drawings of the open document, by content; dropped with it. */
  private drawings: DrawingIndex | null = null;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    sessionId?: string,
  ) {
    this._sessionId = sessionId ?? generateSessionId();
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get kind(): OpenedPdfDocumentKind | null {
    return this._kind;
  }

  /**
   * Where the current bytes come from: the immutable base (registry key,
   * file path for file bases) and the layer the session was opened with.
   * One interpretation for signing candidates, overlays and verbatim reads.
   */
  get source(): DocumentSource {
    if (!this._source) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document is not open');
    }
    return this._source;
  }

  isOpen(): boolean {
    return this.docPtr !== null;
  }

  open(bytes: Uint8Array, password: string | null = null): void {
    this.openFromHandle(openFatMemoryDocument(this.runtime, bytes, password));
  }

  openFromHandle(handle: OpenedPdfDocument): void {
    if (this.docPtr) {
      handle.close();
      throw new EngineError(EngineErrorCode.InvalidArg, 'document already open');
    }
    this.docPtr = handle.docPtr;
    this.closeDocument = () => handle.close();
    this._kind = handle.kind;
    this._source = handle.source;
    this.pages = new PagePtrPool(this.runtime, handle.docPtr, this.residency);
    this.parkedLoad = null;
    this.drawings = null;
    this.loadedSeq = this.editsSeqCounter;
  }

  /**
   * Whether a write was committed since the current bytes were loaded. When
   * false, the loaded bytes are the document: a save returns them verbatim
   * and a signing candidate is built straight on them.
   */
  hasUnsavedEdits(): boolean {
    return this.editsSeqCounter !== this.loadedSeq;
  }

  /** Cached hash of the current loaded bytes, or `null` when not computed since the last load. */
  cachedPlainSha256(): string | null {
    return this.plainSha256 && this.plainSha256.loadedSeq === this.loadedSeq
      ? this.plainSha256.sha256
      : null;
  }

  rememberPlainSha256(sha256: string): void {
    this.plainSha256 = { loadedSeq: this.loadedSeq, sha256 };
  }

  /**
   * Re-point this session at new bytes — the one operation that changes
   * what an open session is backed by, used when a completed signature
   * installs its sealed file. The session id, its page object numbers
   * (an incremental save never renumbers) and its retained resources
   * survive; the old document is closed, every page is re-pinned (its
   * cached pointer dropped), and both sequences
   * advance, so every version-keyed cache rebuilds and the new bytes count as
   * loaded.
   */
  install(handle: OpenedPdfDocument): void {
    if (!this.docPtr) {
      handle.close();
      throw new EngineError(EngineErrorCode.DocNotOpen, 'no document to replace');
    }
    let firstError: unknown = null;
    try {
      this.pages?.closeAll();
    } catch (error) {
      firstError = error;
    }
    try {
      this.closeDocument?.();
    } catch (error) {
      firstError ??= error;
    }
    this.docPtr = handle.docPtr;
    this.closeDocument = () => handle.close();
    this._kind = handle.kind;
    this._source = handle.source;
    this.pages = new PagePtrPool(this.runtime, handle.docPtr, this.residency);
    this.recordsByIndex.clear();
    this.recordsByObjectNumber.clear();
    this.fullyEnumerated = false;
    this.cacheSeqCounter++;
    this.editsSeqCounter++;
    this.loadedSeq = this.editsSeqCounter;
    this.pendingSigning = null;
    this.drawings = null;
    if (firstError) throw firstError;
  }

  /** The two publish fences a candidate is built on. */
  versionRef(baseSha256: string): DocumentVersionRef {
    return { baseSha256, editsVersion: this.editsSeqCounter };
  }

  /**
   * Park this session in the password-locked state: the document could not
   * be loaded because a (correct) password is missing, so the session keeps
   * how to load it (the already-transferred bytes, a base's path, the layer
   * to open) and waits for an unlock attempt. A locked session occupies its
   * docId key like an open one — every operation except the password check
   * rejects with DocPasswordRequired.
   */
  parkLocked(load: (password: string | null) => void): void {
    if (this.docPtr) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'document already open');
    }
    this.parkedLoad = load;
  }

  isLocked(): boolean {
    return this.docPtr === null && this.parkedLoad !== null;
  }

  /**
   * Load a locked session with `password`. A wrong one throws
   * `DocPasswordIncorrect` and leaves the session parked for another try.
   */
  unlockWith(password: string | null): void {
    if (!this.parkedLoad) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document session is not locked');
    }
    this.parkedLoad(password);
    this.parkedLoad = null;
  }

  private parkedLoad: ((password: string | null) => void) | null = null;

  /** Number of pages in the document. */
  pageCount(): number {
    return this.runtime.fn.FPDF_GetPageCount(this.requireDocPtr());
  }

  /**
   * Lazily enumerate every page and cache (pageObjectNumber, pageIndex).
   * Necessary before a whole-document list and any pon -> pageIndex resolution.
   */
  ensureFullPageRegistry(): void {
    if (this.fullyEnumerated) return;
    const { fn } = this.runtime;
    const docPtr = this.requireDocPtr();
    const count = fn.FPDF_GetPageCount(docPtr);
    for (let i = 0; i < count; i++) {
      if (this.recordsByIndex.has(i)) continue;
      const pageObjectNumber = fn.EPDFDoc_GetPageObjectNumberByIndex(docPtr, i);
      if (!isValidPageObjectNumber(pageObjectNumber)) {
        // Spec violation: ISO 32000-1 §7.7.3.3 requires every
        // /Page to be referenced indirectly from the /Pages tree.
        // PDFium's loader is permissive enough to surface direct
        // page dicts from broken generators, but the engine's
        // identity model requires a real indirect object number,
        // so we refuse the document here with a clear, actionable
        // error.
        throw new EngineError(
          EngineErrorCode.MalformedPdf,
          `page at index ${i} is a direct (non-indirect) PDF object; the engine requires every page to have a stable indirect object number`,
          { details: { pageIndex: i, pageObjectNumber } },
        );
      }
      const record: PageRecord = { pageObjectNumber, pageIndex: i };
      this.recordsByIndex.set(i, record);
      this.recordsByObjectNumber.set(pageObjectNumber, record);
    }
    this.fullyEnumerated = true;
  }

  /** Lookup; populates the cache for one page only on cache miss. */
  recordByObjectNumber(pageObjectNumber: PageObjectNumber): PageRecord {
    const cached = this.recordsByObjectNumber.get(pageObjectNumber);
    if (cached) return cached;

    // Enumerate the page tree for its display index: O(pageCount) once per
    // session, and no page loads. (Loading a page to see that it exists would
    // parse its whole content: seconds on a heavy page.)
    this.ensureFullPageRegistry();
    const found = this.recordsByObjectNumber.get(pageObjectNumber);
    if (!found) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no page with object number ${pageObjectNumber}`,
      );
    }
    return found;
  }

  /**
   * Resolve a page address to its registry record — the one boundary where
   * a `PageRef` becomes a page object number. Throws `NotFound` for an
   * unknown page.
   */
  resolvePageRef(ref: PageRef): PageRecord {
    return this.recordByObjectNumber(ref.objectNumber);
  }

  /** `resolvePageRef` over a batch, preserving order. */
  resolvePageRefs(refs: readonly PageRef[]): PageObjectNumber[] {
    return refs.map((ref) => this.resolvePageRef(ref).pageObjectNumber);
  }

  /** All page records, in display order. Forces full enumeration. */
  allRecords(): PageRecord[] {
    this.ensureFullPageRegistry();
    return Array.from(this.recordsByIndex.entries())
      .sort(([a], [b]) => a - b)
      .map(([, r]) => r);
  }

  /**
   * Drop the cached `pageIndex <-> pageObjectNumber` mapping and force a
   * fresh enumeration on next access. Called by `PagesMutator`
   * after `FPDF_MovePages` shuffles page positions.
   */
  refreshPageRegistry(): void {
    this.recordsByIndex.clear();
    this.recordsByObjectNumber.clear();
    this.fullyEnumerated = false;
    this.ensureFullPageRegistry();
  }

  /**
   * The version key for caches built from the document (the forms model,
   * the signature model, search text): an entry built at sequence N is
   * exactly valid while the sequence is still N. Coarse on purpose: widgets
   * are annotations and page edits move widgets, so any write may change
   * derived form state.
   */
  cacheSeq(): number {
    return this.cacheSeqCounter;
  }

  /**
   * Make every cache keyed on {@link cacheSeq} build again. Writers call it
   * after a write, before they read back; an abort calls it too, because a
   * cache may have been built from what the transaction wrote.
   */
  invalidateDerived(): void {
    this.cacheSeqCounter++;
  }

  /**
   * The count of committed writes: what {@link hasUnsavedEdits} and a signing
   * candidate's `editsVersion` compare.
   */
  editsSeq(): number {
    return this.editsSeqCounter;
  }

  /** Count one committed write. Called once per write, after its commit. */
  noteEdit(): void {
    this.editsSeqCounter++;
  }

  // ── transactions ──────────────────────────────────────────────────────────

  /** Whether a layer transaction is open (see {@link beginTransaction}). */
  inTransaction(): boolean {
    return this.transaction !== null;
  }

  /**
   * Open a layer transaction: until {@link commitTransaction} or
   * {@link abortTransaction}, every write lands in an overlay that only a
   * commit keeps, and every read sees it. Only a layer document has
   * transactions.
   */
  beginTransaction(): void {
    const docPtr = this.requireDocPtr();
    if (this.transaction) {
      throw new EngineError(EngineErrorCode.Unknown, 'a transaction is already open');
    }
    if (!this.runtime.fn.EPDFLayer_BeginTransaction(docPtr)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFLayer_BeginTransaction refused');
    }
    this.transaction = { docPtr };
  }

  /**
   * Keep everything the open transaction wrote. A commit that fails can't
   * say how far it got, so the session becomes unusable.
   */
  commitTransaction(): void {
    const { docPtr } = this.requireTransaction();
    // Both sides must agree a transaction is open before one is kept. This
    // throws with the transaction still open, so the caller aborts it.
    if (!this.runtime.fn.EPDFLayer_IsInTransaction(docPtr)) {
      throw new EngineError(EngineErrorCode.Unknown, 'the layer transaction is no longer open');
    }
    this.transaction = null;
    let committed = false;
    try {
      committed = this.runtime.fn.EPDFLayer_CommitTransaction(docPtr);
    } finally {
      if (!committed) this.unusableReason = COMMIT_FAILED;
    }
    if (!committed) throw new EngineError(EngineErrorCode.DocNotOpen, COMMIT_FAILED);
  }

  /**
   * Drop everything the open transaction wrote, and forget what this session
   * learned from it. Never throws: it runs while a failure is on its way out,
   * and a failed abort makes the session unusable instead.
   */
  abortTransaction(): void {
    const { docPtr } = this.requireTransaction();
    this.transaction = null;
    let aborted = false;
    try {
      aborted = this.runtime.fn.EPDFLayer_AbortTransaction(docPtr);
    } catch {
      // Reported below: the session can't say what the document holds.
    }
    // Object numbers the transaction used now resolve to nothing, and its
    // page edits are gone: the drawings and page registry read them again.
    this.drawings?.forget();
    this.recordsByIndex.clear();
    this.recordsByObjectNumber.clear();
    this.fullyEnumerated = false;
    this.invalidateDerived();
    if (!aborted) this.unusableReason = 'a layer transaction failed to abort';
  }

  /**
   * Throws once a transaction neither committed nor aborted, so nothing reads
   * or writes a document in an unknown state.
   */
  assertUsable(): void {
    if (this.unusableReason) {
      throw new EngineError(
        EngineErrorCode.DocNotOpen,
        `${this.unusableReason}; open the document again`,
      );
    }
  }

  private requireTransaction(): { readonly docPtr: Ptr } {
    if (!this.transaction) {
      throw new EngineError(EngineErrorCode.Unknown, 'no transaction is open');
    }
    return this.transaction;
  }

  pagePool(): PagePtrPool {
    if (!this.pages) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document is not open');
    }
    return this.pages;
  }

  /** The open document's stamp drawings, by content (see {@link DrawingIndex}). */
  drawingIndex(): DrawingIndex {
    if (!this.docPtr) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document is not open');
    }
    this.drawings ??= new DrawingIndex();
    return this.drawings;
  }

  requireDocPtr(): Ptr {
    if (!this.docPtr) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document is not open');
    }
    return this.docPtr;
  }

  /**
   * Park a disposer to run when this session closes. Used by operations
   * whose native side leaves the session document referencing another
   * resource — e.g. `pages.insert`: `FPDF_ImportPagesByIndex` does not
   * fully detach imported objects from their source document, so the
   * source doc + its byte buffer must stay alive until the destination
   * can no longer be saved (i.e. until this session closes).
   */
  retainUntilClose(dispose: () => void): void {
    this.retained.push(dispose);
  }

  private readonly retained: Array<() => void> = [];

  close(): void {
    let firstError: unknown = null;
    try {
      this.pages?.closeAll();
    } catch (error) {
      firstError = error;
    } finally {
      this.pages = null;
    }

    // A candidate written to a file must not outlive the session that parked it.
    if (this.pendingSigning?.saved.kind === 'file') {
      try {
        this.runtime.fileWrite.removeFile(this.pendingSigning.saved.path);
      } catch (error) {
        firstError ??= error;
      }
    }

    try {
      this.closeDocument?.();
    } catch (error) {
      firstError ??= error;
    } finally {
      this.closeDocument = null;
      this.docPtr = null;
      this._kind = null;
      this._source = null;
      this.parkedLoad = null;
      this.pendingSigning = null;
      this.lastCompletion = null;
      this.drawings = null;
      this.transaction = null;
      this.recordsByIndex.clear();
      this.recordsByObjectNumber.clear();
      this.fullyEnumerated = false;
    }

    // Retained resources go last (reverse order): the session doc that
    // referenced them is closed above, so they are safe to release now.
    for (let i = this.retained.length - 1; i >= 0; i--) {
      try {
        this.retained[i]();
      } catch (error) {
        firstError ??= error;
      }
    }
    this.retained.length = 0;

    if (firstError) throw firstError;
  }
}

const COMMIT_FAILED = 'a layer transaction failed to commit';

// Monotonic per-realm counter: a session id only has to be unique, so a
// counter makes collisions structurally impossible within a realm, and the
// timestamp distinguishes ids across realm restarts. Deliberately not random: there is
// no adversary to hide the id from (anyone in-process can call the engine
// directly), and pulling in crypto would add runtime constraints for nothing.
let sessionCounter = 0;

function generateSessionId(): string {
  return `sess_${(++sessionCounter).toString(36)}_${Date.now().toString(36)}`;
}

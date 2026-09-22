import type {
  DocumentVersionRef,
  PageObjectNumber,
  PageState,
  RevisionToken,
  SessionKind,
  SignatureCompleteResult,
  SignaturePrepared,
  SignedDocumentPolicy,
  WeakAnnotationState,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  knownWeakAnnotationState,
  isValidPageObjectNumber,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type { PageRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import {
  openFatMemoryDocument,
  type DocumentSource,
  type OpenedPdfDocument,
  type OpenedPdfDocumentKind,
} from './lifecycle/PdfDocumentOpener';
import { PagePtrPool } from './pages/PagePtrPool';
import type { PageRecord } from './pages/PageRecord';
import { LocalRevisionAuthority, type RevisionAuthority } from './revisions/RevisionAuthority';

/**
 * Owns the lifecycle of a single open PDFium document and the
 * identity machinery: page registry (pageObjectNumber <-> pageIndex),
 * `RevisionAuthority` (per-page generation counters), and `PagePtrPool`
 * (refcounted pagePtr access).
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
  readonly result: SignatureCompleteResult;
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

  private revisions: RevisionAuthority | null = null;
  private mutationSeqCounter = 0;
  private pages: PagePtrPool | null = null;
  /**
   * Whether writers honour what the document's signatures forbid (locked
   * fields, structural edits). Set at open from the engine option; the
   * main-thread guard subtracts the matching capabilities.
   */
  signedDocumentPolicy: SignedDocumentPolicy = 'protect';
  /**
   * The shape the caller asked for when opening plain bytes. `layer` (the
   * default) opens them as an immutable base with a fresh layer; `plain`
   * keeps one in-memory document unless the bytes already carry a
   * signature, which always opens as a layer.
   */
  sessionKind: SessionKind = 'layer';
  /** The password the document was opened with; signing candidates open with the same one. */
  password: string | null = null;
  /**
   * Whether mutations on a layer session also serialize the layer artifact
   * into their response (what a server persists). False for a session that
   * became a layer only because its document is signed (see
   * `WorkerHost.openSignedAware`): the caller opened plain bytes and never
   * asked for artifacts.
   */
  persistLayerArtifact = true;
  /** The mutation sequence the current bytes were loaded at (see `hasUnsavedEdits`). */
  private loadedSeq = 0;
  /** SHA-256 (hex) of a plain session's loaded bytes, hashed once per load. */
  private plainSha256: { loadedSeq: number; sha256: string } | null = null;
  /** The signing candidate parked by `signatures.prepare`, if any. */
  pendingSigning: PendingSigning | null = null;
  /** The last completed signing, so a replayed `complete` answers `already-completed`. */
  lastCompletion: SigningCompletion | null = null;

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
    this.revisions = new LocalRevisionAuthority(this._sessionId);
    this.pages = new PagePtrPool(this.runtime, handle.docPtr);
    this.parkedBytes = null;
    this.loadedSeq = this.mutationSeqCounter;
  }

  /**
   * Whether anything was mutated since the current bytes were loaded. When
   * false, the loaded bytes are the document: a save returns them verbatim
   * and a signing candidate is built straight on them.
   */
  hasUnsavedEdits(): boolean {
    return this.mutationSeqCounter !== this.loadedSeq;
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
   * revision bumped, its cached pointer dropped), and the mutation
   * sequence advances so every version-keyed cache rebuilds.
   */
  install(handle: OpenedPdfDocument): void {
    if (!this.docPtr) {
      handle.close();
      throw new EngineError(EngineErrorCode.DocNotOpen, 'no document to replace');
    }
    const previousPages = Array.from(this.recordsByObjectNumber.keys());
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
    this.pages = new PagePtrPool(this.runtime, handle.docPtr);
    this.recordsByIndex.clear();
    this.recordsByObjectNumber.clear();
    this.fullyEnumerated = false;
    for (const pageObjectNumber of previousPages) this.requireRevisions().bump(pageObjectNumber);
    this.mutationSeqCounter++;
    this.loadedSeq = this.mutationSeqCounter;
    this.pendingSigning = null;
    if (firstError) throw firstError;
  }

  /** The two publish fences a candidate is built on. */
  versionRef(baseSha256: string): DocumentVersionRef {
    return { baseSha256, editsVersion: this.mutationSeqCounter };
  }

  /**
   * Park this session in the password-locked state: the document could not
   * be loaded because a (correct) password is missing, so the session keeps
   * the already-transferred bytes and waits for an unlock attempt to load
   * them. A locked session occupies its docId key like an open one — every
   * operation except the password check rejects with DocPasswordRequired.
   */
  parkLocked(bytes: Uint8Array): void {
    if (this.docPtr) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'document already open');
    }
    this.parkedBytes = bytes;
  }

  isLocked(): boolean {
    return this.docPtr === null && this.parkedBytes !== null;
  }

  /** The bytes retained for a later unlock attempt. Locked sessions only. */
  lockedBytes(): Uint8Array {
    if (!this.parkedBytes) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document session is not locked');
    }
    return this.parkedBytes;
  }

  private parkedBytes: Uint8Array | null = null;

  /** Number of pages in the document. */
  pageCount(): number {
    return this.runtime.fn.FPDF_GetPageCount(this.requireDocPtr());
  }

  /**
   * Lazily enumerate every page and cache (pageObjectNumber, pageIndex).
   * Necessary before `listRawAll()` and any pon -> pageIndex resolution.
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
        // error rather than silently routing through a weak
        // identity path.
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

    // Probe the doc by loading the page directly via its object number;
    // walk the index range to find which page index it lives at.
    const { fn } = this.runtime;
    const docPtr = this.requireDocPtr();
    const probePtr = fn.EPDFDoc_LoadPageByObjectNumber(docPtr, pageObjectNumber);
    if (!probePtr) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no page with object number ${pageObjectNumber}`,
      );
    }
    fn.FPDF_ClosePage(probePtr);

    // Now we know the page exists; fall back to a full enumeration to get
    // its display index. This is O(pageCount) once per session.
    this.ensureFullPageRegistry();
    const found = this.recordsByObjectNumber.get(pageObjectNumber);
    if (!found) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `page with object number ${pageObjectNumber} present but unindexable`,
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
    return this.recordByObjectNumber(ref.pageObjectNumber);
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
   * after `FPDF_MovePages` shuffles page positions; we keep
   * weak-annotation knowledge and per-page revision counters intact, both of
   * which are keyed by durable `pageObjectNumber` and survive a page reorder.
   */
  refreshPageRegistry(): void {
    this.recordsByIndex.clear();
    this.recordsByObjectNumber.clear();
    this.fullyEnumerated = false;
    this.ensureFullPageRegistry();
  }

  /** Per-page liveness envelope used by annotation read/mutation results. */
  pageState(pageObjectNumber: PageObjectNumber): PageState {
    // Validate the page exists (throws NotFound for bad pons); liveness is
    // keyed by pon and carries no display order — that lives in PageLayout.
    this.recordByObjectNumber(pageObjectNumber);
    const weakAnnotationState = this.requireRevisions().weakAnnotationState(pageObjectNumber);
    return {
      page: toPageRef(pageObjectNumber),
      revision: this.requireRevisions().token(pageObjectNumber),
      weakAnnotationState,
    };
  }

  /** Set by readers as they discover whether a page has weak annotations. */
  recordWeakFlag(pageObjectNumber: PageObjectNumber, hasWeak: boolean): void {
    this.recordWeakAnnotationState(pageObjectNumber, knownWeakAnnotationState(hasWeak));
  }

  recordWeakAnnotationState(pageObjectNumber: PageObjectNumber, state: WeakAnnotationState): void {
    this.requireRevisions().recordWeakAnnotationState(pageObjectNumber, state);
  }

  weakAnnotationState(pageObjectNumber: PageObjectNumber): WeakAnnotationState {
    return this.requireRevisions().weakAnnotationState(pageObjectNumber);
  }

  /** Bump and return the new revision token; called by mutation paths. */
  bumpRevision(pageObjectNumber: PageObjectNumber): RevisionToken {
    return this.requireRevisions().bump(pageObjectNumber);
  }

  /**
   * Monotonic count of successful document mutations in this session.
   * Version key for detached-snapshot caches (e.g. the forms model):
   * a cache entry built at sequence N is exactly valid while the
   * sequence is still N. Coarse on purpose — widgets are annotations
   * and page ops move widgets, so any mutation may affect derived
   * form state; per-domain counters are a later optimization.
   */
  mutationSeq(): number {
    return this.mutationSeqCounter;
  }

  /** Record one successful mutation; called by mutation paths. */
  noteMutation(): void {
    this.mutationSeqCounter++;
  }

  /**
   * Forget a page's per-session state (revision generation + weak-annotation
   * flag). Called by `pages.delete` after the page object is retired; the
   * page object number is never recycled, so this is hygiene, not correctness.
   */
  dropPageState(pageObjectNumber: PageObjectNumber): void {
    this.requireRevisions().drop(pageObjectNumber);
  }

  validateRevision(token: RevisionToken): void {
    this.requireRevisions().validate(token);
  }

  pagePool(): PagePtrPool {
    if (!this.pages) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document is not open');
    }
    return this.pages;
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
      this.parkedBytes = null;
      this.pendingSigning = null;
      this.lastCompletion = null;
      this.revisions?.clear();
      this.revisions = null;
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

  private requireRevisions(): RevisionAuthority {
    if (!this.revisions) {
      throw new EngineError(EngineErrorCode.DocNotOpen, 'document is not open');
    }
    return this.revisions;
  }
}

// Monotonic per-realm counter: the docSessionId exists only for the local
// bleed-over check (a revision token minted by one session must not validate
// against another), so uniqueness is the whole requirement — a counter makes
// collisions structurally impossible within a realm, and the timestamp
// distinguishes ids across realm restarts. Deliberately not random: there is
// no adversary to hide the id from (anyone in-process can call the engine
// directly), and pulling in crypto would add runtime constraints for nothing.
let sessionCounter = 0;

function generateSessionId(): string {
  return `sess_${(++sessionCounter).toString(36)}_${Date.now().toString(36)}`;
}

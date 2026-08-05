import type {
  PageObjectNumber,
  PageState,
  RevisionToken,
  WeakAnnotationState,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  knownWeakAnnotationState,
  isValidPageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import {
  openFatMemoryDocument,
  type OpenedPdfDocument,
  type OpenedPdfDocumentKind,
} from './lifecycle/PdfDocumentOpener';
import { PagePtrPool } from './pages/PagePtrPool';
import type { PageRecord } from './pages/PageRecord';
import { LocalRevisionAuthority, type RevisionAuthority } from './revisions/RevisionAuthority';

/**
 * Owns the lifecycle of a single open PDFium document and the v3
 * identity machinery: page registry (pageObjectNumber <-> pageIndex),
 * `RevisionAuthority` (per-page generation counters), and `PagePtrPool`
 * (refcounted pagePtr access).
 *
 * Both the local browser Worker and the server worker_thread instantiate
 * this exactly the same way; the only thing that differs is the
 * underlying PdfRuntimeModule (WASM vs native).
 */
export class DocumentSession {
  private docPtr: Ptr | null = null;
  private closeDocument: (() => void) | null = null;
  private _kind: OpenedPdfDocumentKind | null = null;
  private readonly _sessionId: string;

  /** pon -> record */
  private readonly recordsByObjectNumber = new Map<PageObjectNumber, PageRecord>();
  /** pageIndex -> record */
  private readonly recordsByIndex = new Map<number, PageRecord>();
  private fullyEnumerated = false;

  private revisions: RevisionAuthority | null = null;
  private mutationSeqCounter = 0;
  private pages: PagePtrPool | null = null;

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
    this.revisions = new LocalRevisionAuthority(this._sessionId);
    this.pages = new PagePtrPool(this.runtime, handle.docPtr);
    this.parkedBytes = null;
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
      const pon = fn.EPDFDoc_GetPageObjectNumberByIndex(docPtr, i);
      if (!isValidPageObjectNumber(pon)) {
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
          { details: { pageIndex: i, pon } },
        );
      }
      const record: PageRecord = { pageObjectNumber: pon, pageIndex: i };
      this.recordsByIndex.set(i, record);
      this.recordsByObjectNumber.set(pon, record);
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
      pageObjectNumber,
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
   * and page ops move widgets, so ANY mutation may affect derived
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
   * PON is never recycled, so this is hygiene, not correctness.
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
   * Park a disposer to run when THIS session closes. Used by operations
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

    try {
      this.closeDocument?.();
    } catch (error) {
      firstError ??= error;
    } finally {
      this.closeDocument = null;
      this.docPtr = null;
      this._kind = null;
      this.parkedBytes = null;
      this.revisions?.clear();
      this.revisions = null;
      this.recordsByIndex.clear();
      this.recordsByObjectNumber.clear();
      this.fullyEnumerated = false;
    }

    // Retained resources go LAST (reverse order): the session doc that
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

import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

/**
 * A point a change can return the document to, exactly: what the change
 * added is deleted and the numbers it used are free again, and the
 * dictionaries every page shares (the catalog, the form dictionary and its
 * resources) are put back. Each page is recorded before the change first
 * writes to it ({@link page}), and any other object it changes before that
 * write ({@link object}). A change that only adds, apart from those,
 * rolls back to the same object graph and the same save; that is what an
 * import is. Anything that holds object numbers across the change (the
 * drawing index) must be forgotten after a {@link rollback}.
 */
export class DocumentCheckpoint {
  private readonly pages = new Set<number>();

  private constructor(
    private readonly fn: PdfFunctions,
    private handle: Ptr | null,
  ) {}

  static begin(fn: PdfFunctions, docPtr: Ptr): DocumentCheckpoint {
    const handle = fn.EPDFDoc_BeginCheckpoint(docPtr);
    if (!handle) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_BeginCheckpoint returned NULL');
    }
    return new DocumentCheckpoint(fn, handle);
  }

  /** Record the page at `pageIndex`, once, before the first write to it. */
  page(pageIndex: number): void {
    if (this.pages.has(pageIndex)) return;
    if (!this.fn.EPDFDoc_CheckpointPage(this.require(), pageIndex)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `EPDFDoc_CheckpointPage refused page ${pageIndex}`,
      );
    }
    this.pages.add(pageIndex);
  }

  /**
   * Record the dictionary numbered `objectNumber` before a write changes it,
   * such as an annotation a new popup is linked to. One made after the
   * checkpoint needs no record.
   */
  object(objectNumber: number): void {
    if (!this.fn.EPDFDoc_CheckpointObject(this.require(), objectNumber)) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `EPDFDoc_CheckpointObject refused object ${objectNumber}`,
      );
    }
  }

  /** Return the document to the checkpoint. */
  rollback(): void {
    if (!this.fn.EPDFDoc_Rollback(this.require())) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_Rollback failed');
    }
  }

  /** Let the checkpoint go, after a rollback or when the change is kept. Idempotent. */
  end(): void {
    if (this.handle === null) return;
    this.fn.EPDFDoc_EndCheckpoint(this.handle);
    this.handle = null;
  }

  private require(): Ptr {
    if (this.handle === null) {
      throw new EngineError(EngineErrorCode.Unknown, 'the checkpoint has ended');
    }
    return this.handle;
  }
}

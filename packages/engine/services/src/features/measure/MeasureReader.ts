import type {
  PageMeasurementViewport,
  PageObjectNumber,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { Slices } from '../../shared/slices';
import { readViewports } from './internal/readViewports';

export class MeasureReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}
  /** The page's measurement viewports; a page not parsed yet loads in slices. */
  async viewports(
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<PageMeasurementViewport<PdfCoordinates>[]> {
    throwIfAborted(signal);
    const pool = this.session.pagePool(),
      page = await pool.acquireInSlices(pageObjectNumber, signal, slices);
    try {
      return readViewports(this.runtime.fn, this.runtime.mem, page);
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}

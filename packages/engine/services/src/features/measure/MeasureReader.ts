import type { PageMeasurementViewport, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { readViewports } from './internal/readViewports';

export class MeasureReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}
  viewports(pageObjectNumber: PageObjectNumber, signal: AbortSignal): PageMeasurementViewport[] {
    throwIfAborted(signal);
    const pool = this.session.pagePool(),
      page = pool.acquire(pageObjectNumber);
    try {
      return readViewports(this.runtime.fn, this.runtime.mem, page);
    } finally {
      pool.release(pageObjectNumber);
    }
  }
}

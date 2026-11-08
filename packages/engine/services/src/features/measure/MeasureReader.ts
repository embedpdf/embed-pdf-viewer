import type {
  PageMeasurementViewport,
  PageObjectNumber,
  PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { readViewports } from './internal/readViewports';

export class MeasureReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}
  /** The page's measurement viewports, read from its dictionary: the page isn't loaded. */
  viewports(
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
  ): PageMeasurementViewport<PdfCoordinates>[] {
    throwIfAborted(signal);
    const index = this.session.recordByObjectNumber(pageObjectNumber).pageIndex;
    return readViewports(this.runtime.fn, this.runtime.mem, this.session.requireDocPtr(), index);
  }
}

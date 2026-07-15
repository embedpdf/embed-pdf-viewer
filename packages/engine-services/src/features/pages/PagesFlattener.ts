import type {
  MutationMeta,
  PageFlattenResult,
  PageFlattenUsage,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, serializeError } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/pdf-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { AnnotationReader } from '../annotations';

const FLATTEN_FAIL = 0;
const FLATTEN_SUCCESS = 1;
const FLATTEN_NOTHING_TO_DO = 2;

/** Layer-safe page flattening. Content and annotation liveness change together. */
export class PagesFlattener {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  flatten(
    pageObjectNumbers: PageObjectNumber[],
    usage: PageFlattenUsage,
    signal: AbortSignal,
  ): PageFlattenResult {
    throwIfAborted(signal);
    requireUniquePages(pageObjectNumbers);
    for (const pageObjectNumber of pageObjectNumbers) {
      this.session.recordByObjectNumber(pageObjectNumber);
    }

    const results: PageFlattenResult['results'] = [];
    const affected = new Set<PageObjectNumber>();
    let stop = false;
    for (const pageObjectNumber of pageObjectNumbers) {
      if (stop || (signal.aborted && affected.size > 0)) {
        stop = true;
        results.push({ pageObjectNumber, status: 'skipped' });
        continue;
      }
      if (signal.aborted) throwIfAborted(signal);

      const pool = this.session.pagePool();
      const pagePtr = pool.acquire(pageObjectNumber);
      let code: number;
      try {
        code = this.runtime.fn.EPDFPage_Flatten(pagePtr, usage === 'print' ? 1 : 0);
      } catch (error) {
        affected.add(pageObjectNumber);
        results.push({ pageObjectNumber, status: 'failed', error: serializeError(error) });
        stop = true;
        continue;
      } finally {
        pool.release(pageObjectNumber);
      }

      if (code === FLATTEN_NOTHING_TO_DO) {
        results.push({ pageObjectNumber, status: 'unchanged' });
      } else if (code === FLATTEN_SUCCESS) {
        affected.add(pageObjectNumber);
        results.push({ pageObjectNumber, status: 'applied' });
      } else {
        affected.add(pageObjectNumber);
        results.push({
          pageObjectNumber,
          status: 'failed',
          error: serializeError(
            new EngineError(
              EngineErrorCode.Unknown,
              code === FLATTEN_FAIL
                ? 'native page flatten failed after preflight'
                : `native page flatten returned unexpected code ${code}`,
            ),
          ),
        });
        stop = true;
      }
    }

    if (affected.size === 0) return { pageObjectNumbers, usage, results, meta: null };

    this.session.noteMutation();
    for (const pageObjectNumber of affected) {
      this.session.bumpRevision(pageObjectNumber);
      try {
        // Recompute the weak-annotation flag from the annotations that remain.
        new AnnotationReader(this.runtime, this.session).list(pageObjectNumber, signal);
      } catch {
        // The page state remains conservatively unknown. Never lose the layer
        // artifact because a post-flatten diagnostic read failed.
      }
    }
    const meta: MutationMeta = {
      affectedPages: [...affected].map((pageObjectNumber) =>
        this.session.pageState(pageObjectNumber),
      ),
      cacheDelta: null,
    };
    return { pageObjectNumbers, usage, results, meta };
  }
}

function requireUniquePages(pageObjectNumbers: PageObjectNumber[]): void {
  if (pageObjectNumbers.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'pages.flatten requires at least one page');
  }
  const seen = new Set<PageObjectNumber>();
  for (const pageObjectNumber of pageObjectNumbers) {
    if (seen.has(pageObjectNumber)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.flatten was given duplicate page object number ${pageObjectNumber}`,
      );
    }
    seen.add(pageObjectNumber);
  }
}

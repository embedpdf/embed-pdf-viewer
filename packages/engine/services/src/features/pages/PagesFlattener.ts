import type {
  MutationMeta,
  PageFlattenResult,
  PageFlattenUsage,
  PageObjectNumber,
  PageRef,
} from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode, toPageRef } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { promoteInlineAnnotations } from '../annotations/internal/write/promoteInlineAnnotations';

const FLATTEN_FAIL = 0;
const FLATTEN_SUCCESS = 1;
const FLATTEN_NOTHING_TO_DO = 2;

/**
 * Layer-safe page flattening. Content and annotation liveness change
 * together, all or nothing: a page that fails, or a cancel, aborts the whole
 * flatten.
 */
export class PagesFlattener {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  flatten(pages: PageRef[], usage: PageFlattenUsage, signal: AbortSignal): PageFlattenResult {
    throwIfAborted(signal);
    const pageObjectNumbers = this.session.resolvePageRefs(pages);
    requireUniquePages(pageObjectNumbers);

    const results: PageFlattenResult['results'] = [];
    const affected = new Set<PageObjectNumber>();
    for (const pageObjectNumber of pageObjectNumbers) {
      throwIfAborted(signal);
      // A flatten removes entries from /Annots; promotion keeps every
      // position.
      if (promoteInlineAnnotations(this.runtime, this.session, pageObjectNumber)) {
        affected.add(pageObjectNumber);
      }
      const pool = this.session.pagePool();
      const pagePtr = pool.acquire(pageObjectNumber);
      let code: number;
      try {
        code = this.runtime.fn.EPDFPage_Flatten(pagePtr, usage === 'print' ? 1 : 0);
      } finally {
        pool.release(pageObjectNumber);
      }
      if (code === FLATTEN_NOTHING_TO_DO) {
        results.push({ page: toPageRef(pageObjectNumber), status: 'unchanged' });
        continue;
      }
      if (code !== FLATTEN_SUCCESS) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          code === FLATTEN_FAIL
            ? 'native page flatten failed after preflight'
            : `native page flatten returned unexpected code ${code}`,
        );
      }
      affected.add(pageObjectNumber);
      results.push({ page: toPageRef(pageObjectNumber), status: 'applied' });
    }

    if (affected.size === 0) {
      return { pages, usage, results, meta: { affectedPages: [], cacheDelta: null } };
    }

    this.session.invalidateDerived();
    const meta: MutationMeta = {
      affectedPages: [...affected].map((pageObjectNumber) => toPageRef(pageObjectNumber)),
      cacheDelta: null,
    };
    return { pages, usage, results, meta };
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

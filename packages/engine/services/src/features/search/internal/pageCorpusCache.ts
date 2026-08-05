import type { FoldedText, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import { foldText } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { PageTextReader } from '../../text/PageTextReader';

interface PageCorpusEntry {
  /** The session mutation sequence the entry was built at. */
  seq: number;
  /** Default-fold (`{}`) corpus; `folded.original` is the raw page text. */
  folded: FoldedText;
}

/**
 * Per-session, per-page search corpus: the page's extracted text plus its
 * DEFAULT fold (the one literal queries with default options search).
 * This is the local engine's in-memory equivalent of the server's corpus
 * artifacts — same fold version, same shape, built lazily on first search
 * and reused across slices and re-queries.
 *
 * Version-keyed on `DocumentSession.mutationSeq()` per PAGE (not per
 * session): a form fill or annotation edit bumps the sequence, and only
 * the pages actually re-read after that pay the re-extraction — untouched
 * cache entries for other pages are refreshed lazily as they're revisited.
 *
 * Capped: search touches every page of arbitrarily large documents, so
 * entries evict in insertion order past `MAX_CACHED_PAGES` (text of ~500
 * pages ≈ a few MB — bounded regardless of document size).
 */
const MAX_CACHED_PAGES = 512;

const cache = new WeakMap<DocumentSession, Map<PageObjectNumber, PageCorpusEntry>>();

export function acquirePageCorpus(
  runtime: PdfRuntimeModule,
  session: DocumentSession,
  pageObjectNumber: PageObjectNumber,
  signal: AbortSignal,
): FoldedText {
  const seq = session.mutationSeq();
  let pages = cache.get(session);
  if (!pages) {
    pages = new Map();
    cache.set(session, pages);
  }

  const hit = pages.get(pageObjectNumber);
  if (hit && hit.seq === seq) return hit.folded;

  const text = new PageTextReader(runtime, session).read(pageObjectNumber, signal).text;
  const folded = foldText(text);

  pages.delete(pageObjectNumber); // re-insert = most recently used
  pages.set(pageObjectNumber, { seq, folded });
  if (pages.size > MAX_CACHED_PAGES) {
    const oldest = pages.keys().next().value;
    if (oldest !== undefined) pages.delete(oldest);
  }
  return folded;
}

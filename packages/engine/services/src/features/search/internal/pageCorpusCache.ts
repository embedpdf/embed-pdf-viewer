import type { FoldedText, PageObjectNumber, PageTextSnapshot } from '@embedpdf/engine-core/runtime';
import { foldText } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';
import { PageTextReader } from '../../text/PageTextReader';

export interface PageCorpus {
  /** Default-fold (`{}`) corpus; `folded.original` IS `snapshot.text`. */
  folded: FoldedText;
  /**
   * The page text snapshot the corpus was folded from — carried so match
   * ranges (text space) can be converted to CHARACTER space via the
   * engine-core charmap helpers without re-reading the page.
   */
  snapshot: PageTextSnapshot;
}

interface PageCorpusEntry extends PageCorpus {
  /** The session mutation sequence the entry was built at. */
  seq: number;
}

/**
 * Per-session, per-page search corpus: the page's text snapshot plus its
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
): PageCorpus {
  const seq = session.mutationSeq();
  let pages = cache.get(session);
  if (!pages) {
    pages = new Map();
    cache.set(session, pages);
  }

  const hit = pages.get(pageObjectNumber);
  if (hit && hit.seq === seq) return hit;

  const snapshot = new PageTextReader(runtime, session).read(pageObjectNumber, signal);
  const entry: PageCorpusEntry = { seq, folded: foldText(snapshot.text), snapshot };

  pages.delete(pageObjectNumber); // re-insert = most recently used
  pages.set(pageObjectNumber, entry);
  if (pages.size > MAX_CACHED_PAGES) {
    const oldest = pages.keys().next().value;
    if (oldest !== undefined) pages.delete(oldest);
  }
  return entry;
}

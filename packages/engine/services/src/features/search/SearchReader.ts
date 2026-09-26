import type {
  SearchMatch,
  SearchScanRequest,
  SearchSlice,
  TextRange,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  buildSnippet,
  charRangeForTextOffsets,
  createTextLayout,
  foldOptionsFor,
  foldText,
  matchLiteral,
  matchRegex,
  searchQueryOf,
  validateSearchQuery,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { PageGeometryReader } from '../geometry/PageGeometryReader';
import { acquirePageCorpus } from './internal/pageCorpusCache';
import { decodeSearchCursor, encodeSearchCursor, searchQueryKey } from './internal/searchCursor';

/**
 * Per-slice budget defaults and ceilings. The ceiling is the worker's
 * self-defense: one `query()` call is one synchronous stretch of native
 * work, and no request — whatever budget it asks for — may hold the
 * worker longer than ~a few hundred pages. Callers wanting more issue
 * more slices; the cursor makes that cheap.
 */
const DEFAULT_MAX_PAGES = 64;
const CEILING_MAX_PAGES = 256;
const DEFAULT_MAX_MATCHES = 256;
const CEILING_MAX_MATCHES = 1024;

/**
 * The whole search pipeline for one budgeted slice, running inside the
 * trust boundary (worker locally, server process in the cloud):
 *
 *   extract — page text via the session corpus cache (version-keyed on
 *             `mutationSeq`, so results always reflect the current layer
 *             view — text a redaction removed is unfindable),
 *   match   — the pure engine-core matcher (identical code on every
 *             engine; parity by construction),
 *   anchor  — geometry read only for pages that actually matched, rects
 *             via the selection line-merge (one rect per visual line).
 *
 * Scope gating (`doc.text.search`, `doc.text.copy` for snippets) is the
 * caller's job — this reader assumes an authorized request.
 */
export class SearchReader {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  query(request: SearchScanRequest, signal: AbortSignal): SearchSlice {
    throwIfAborted(signal);
    const query = searchQueryOf(request);
    const snippets = request.snippets ?? false;

    // One validator covers everything: regex dialect and flag combos
    // (regex + matchDiacritics / ignoreWhitespace are the rejected ones).
    // Literal queries are always valid.
    const valid = validateSearchQuery(query);
    if (!valid.ok) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `invalid search query (${valid.issue}): ${valid.message}`,
      );
    }

    const records = this.session.allRecords();
    const pageCount = records.length;

    // Nothing findable — don't burn a scan on an empty needle.
    if (!query.regex && foldText(query.text).folded.trim().length === 0) {
      return { matches: [], nextCursor: null, pagesSearched: 0, pageCount };
    }

    const seq = this.session.mutationSeq();
    const key = searchQueryKey(query, snippets);

    let start = 0;
    let scanned = 0;
    if (request.cursor !== undefined) {
      const state = decodeSearchCursor(request, request.cursor, seq, key);
      start = state.start;
      scanned = state.scanned;
    } else {
      if (request.from !== undefined) {
        // Throws NotFound for an unknown page — same contract as page(pon).
        start = this.session.resolvePageRef(request.from).pageObjectNumber;
      }
      if (request.skip !== undefined) {
        // Trusted-position resume: the caller pins content versions
        // externally (the cloud wire's search token carries the content
        // epoch), so no sequence check applies here. Clamp into range.
        scanned = Math.min(Math.max(0, Math.floor(request.skip)), pageCount);
      }
    }

    // Viewport-first: rotate display order to begin at `start`, wrapping.
    let order = records;
    if (start !== 0) {
      const at = records.findIndex((r) => r.pageObjectNumber === start);
      order = records.slice(at).concat(records.slice(0, at));
    }

    const maxPages = clamp(request.limit?.pages, DEFAULT_MAX_PAGES, CEILING_MAX_PAGES);
    const maxMatches = clamp(request.limit?.matches, DEFAULT_MAX_MATCHES, CEILING_MAX_MATCHES);

    const matches: SearchMatch[] = [];
    let pagesThisSlice = 0;
    // Budget checks sit at page granularity: a page's matches are never
    // split across slices, so the cursor only ever points between pages.
    while (scanned < order.length && pagesThisSlice < maxPages && matches.length < maxMatches) {
      throwIfAborted(signal);
      const pageObjectNumber = order[scanned].pageObjectNumber;
      const corpus = acquirePageCorpus(this.runtime, this.session, pageObjectNumber, signal);

      const text = corpus.snapshot.text;
      let ranges: TextRange[];
      if (query.regex) {
        ranges = matchRegex(text, query);
      } else if (query.matchCase || query.matchDiacritics || query.ignoreWhitespace) {
        // Non-default fold options: re-fold the cached raw text per query.
        ranges = matchLiteral(foldText(text, foldOptionsFor(query)), query);
      } else {
        ranges = matchLiteral(corpus.folded, query);
      }

      if (ranges.length > 0) {
        const geometry = new PageGeometryReader(this.runtime, this.session).read(
          pageObjectNumber,
          signal,
        );
        // One canonical layout per page, shared by every match on it.
        const layout = createTextLayout(geometry);
        for (const range of ranges) {
          // Match ranges are text-space (string offsets); the hit and the
          // layout speak character space. Convert exactly once, here — the
          // biased range helper keeps zero-width characters adjacent to the
          // match outside it on both sides. Snippets are built from the text.
          const chars = charRangeForTextOffsets(corpus.snapshot, range);
          matches.push({
            page: toPageRef(pageObjectNumber),
            start: chars.start,
            count: chars.count,
            segments: layout.segments(chars),
            ...(snippets ? { snippet: buildSnippet(text, range) } : {}),
          });
        }
      }

      scanned++;
      pagesThisSlice++;
    }

    return {
      matches,
      nextCursor:
        scanned < order.length ? encodeSearchCursor({ v: 1, seq, key, start, scanned }) : null,
      pagesSearched: scanned,
      pageCount,
    };
  }
}

function clamp(requested: number | undefined, fallback: number, ceiling: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.max(1, Math.min(Math.floor(requested), ceiling));
}

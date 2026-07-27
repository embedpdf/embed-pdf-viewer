import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  canonicalSearchQuery,
  searchContentEpoch,
  type DocumentSearchService,
  type SearchQuery,
  type SearchRequest,
  type SearchSlice,
} from '@embedpdf/engine-core/runtime';
import {
  SearchSliceSchema,
  decodeSearchToken,
  encodeSearchToken,
  wirePaths,
  type SearchToken,
} from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud search transport: versioned GETs, one per budgeted slice.
 *
 * Every slice URL is a canonical cache key — the search token pins the
 * layer's content epoch (computed from the cached manifest), the
 * CANONICAL query (default-fold literals collapse case/diacritic
 * variants into one entry), and the resume position. Identical searches
 * from any reader of the document hit the same CDN entry; matches are
 * all that ever crosses the trust boundary, and the rects/full endpoint
 * split keeps permission tiers in disjoint cache namespaces.
 *
 * Staleness rides the standard versioned-read signal: a first slice
 * answered `NotFound` means OUR manifest is stale → refresh and retry
 * once; a continuation answered `NotFound` means the document changed
 * mid-search → `InvalidArg`, same contract as the local engine's cursor.
 */
export class CloudDocumentSearchService implements DocumentSearchService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  query(request: SearchRequest): AbortablePromise<SearchSlice> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    return AbortablePromise.run<SearchSlice>(async (signal) => {
      const mode = request.mode ?? 'full';
      const path = mode === 'rects' ? wirePaths.layerSearchRects : wirePaths.layerSearchFull;
      const get = (token: string) =>
        this.http.getJson(
          path(this.docId, this.layerName, token),
          (raw) => SearchSliceSchema.parse(raw),
          signal,
        );
      const query = canonicalSearchQuery(request.query);

      if (request.cursor !== undefined) {
        let token: SearchToken;
        try {
          token = decodeSearchToken(request.cursor);
        } catch {
          throw new EngineError(EngineErrorCode.InvalidArg, 'malformed search cursor');
        }
        // Local-engine cursor parity: a cursor is pinned to its query and
        // scan origin; replaying it against anything else is a caller bug.
        if (queryIdentity(token.query) !== queryIdentity(query)) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            'search cursor belongs to a different query — restart the search',
          );
        }
        if (request.startPage !== undefined && request.startPage !== token.startPage) {
          throw new EngineError(
            EngineErrorCode.InvalidArg,
            'startPage conflicts with the cursor — omit startPage when resuming',
          );
        }
        try {
          return await get(request.cursor);
        } catch (err) {
          if (EngineError.is(err, EngineErrorCode.NotFound)) {
            throw new EngineError(
              EngineErrorCode.InvalidArg,
              'document changed since this search cursor was issued — restart the search',
            );
          }
          throw err;
        }
      }

      const mint = (epoch: string) =>
        encodeSearchToken({
          epoch,
          query,
          ...(request.startPage !== undefined ? { startPage: request.startPage } : {}),
          skip: 0,
          ...(request.budget !== undefined ? { budget: request.budget } : {}),
        });
      try {
        const manifest = await this.manifest.get(signal);
        return await get(mint(searchContentEpoch(manifest)));
      } catch (err) {
        if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
        // Our cached manifest is behind the layer — the standard
        // versioned-read retry: refresh once, re-mint, re-issue.
        const fresh = await this.manifest.refresh(signal);
        return await get(mint(searchContentEpoch(fresh)));
      }
    });
  }
}

/** Query identity for cursor validation (option order pinned by hand). */
function queryIdentity(query: SearchQuery): string {
  return JSON.stringify([
    query.regex ? 'r' : 'l',
    query.text,
    query.matchCase ? 1 : 0,
    query.matchDiacritics ? 1 : 0,
    query.wholeWord ? 1 : 0,
  ]);
}

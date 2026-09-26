import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  EngineError,
  EngineErrorCode,
  searchContentEpoch,
  toPageRef,
  wirePack,
  type SearchQuery,
  type SearchLimit,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import { decodeSearchToken, encodeSearchToken } from '@embedpdf/engine-core/wire';
import { requireLayerDocAccessOnly, requireLayerResource } from '../app/jwt-plugin';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import {
  abortSignalFromRequest,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
} from './_helpers';

interface SearchRouteDeps {
  documentService: DocumentService;
}

/** Decoded state of one search GET — the whole cache key minus the tier. */
interface SearchGetState {
  /** Content epoch the caller pinned; absent on the unversioned form. */
  epoch?: string;
  query: SearchQuery;
  /** The scan origin, by page object number. */
  from?: number;
  skip: number;
  limit?: SearchLimit;
}

/** The two search resources: matches only, or matches with snippets. */
type SearchTier = 'rects' | 'full';

const RESOURCE_BY_TIER = {
  rects: 'layer-search-rects',
  full: 'layer-search-full',
} as const;

/**
 * Layer-scoped search: one budgeted slice per GET, mirroring the render
 * routes' two forms.
 *
 *   - `/search/{mode}/data@:token` — versioned. The token
 *     (`encodeSearchToken`) carries the content epoch + query + position
 *     and is the cache key; the response is immutable and CDN-cacheable.
 *     A stale epoch answers `NotFound` (the standard versioned-read
 *     refresh signal), never stale results.
 *   - `/search/{mode}/data?…` — unversioned, flat query params (`q` as
 *     plain text), served from the current content, always `no-store`.
 *
 * The tier is the path, not a parameter: rects (matches only) and full
 * (with snippets) are separate resources (`layer-search-rects` /
 * `layer-search-full`) with separate capability requirements and separate
 * CDN prefixes, so a credential or cache entry for one tier can never serve
 * the other. `full` requires `doc.text.search` and `doc.text.copy` — a
 * snippet is extracted text.
 *
 * Continuation: responses carry `nextCursor` = the ready-made token for
 * the next slice (same epoch, advanced `skip`) — deterministic, so the
 * whole cursor chain of a popular query is cacheable end to end. There
 * is no server-side job; cancelling is not asking for the next slice.
 */
export async function registerSearchRoutes(
  app: FastifyInstance,
  deps: SearchRouteDeps,
): Promise<void> {
  for (const tier of ['rects', 'full'] as const) {
    app.get(`/v1/docs/:docId/layers/:layerName/search/${tier}/data@:token`, async (req, reply) => {
      const { token } = req.params as { token: string };
      rejectQueryParamsOnTokenUrl(req.query);
      const decoded = parseTokenOrInvalidArg(decodeSearchToken, token, 'search token');
      return runSearchSlice(deps, req, reply, tier, decoded, true);
    });

    app.get(`/v1/docs/:docId/layers/:layerName/search/${tier}/data`, async (req, reply) => {
      return runSearchSlice(deps, req, reply, tier, searchStateFromParams(req.query), false);
    });
  }
}

async function runSearchSlice(
  deps: SearchRouteDeps,
  req: FastifyRequest,
  reply: FastifyReply,
  tier: SearchTier,
  state: SearchGetState,
  versioned: boolean,
) {
  const { documentService } = deps;
  const { docId, layerName } = req.params as { docId: string; layerName: string };
  const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
  const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
  const ctx: OpenContext = requireLayerResource(
    req,
    docId,
    layerName,
    RESOURCE_BY_TIER[tier],
    pdfBits,
  );

  const manifest = await documentService.getLayerManifest(ctx, docId, layerName);
  const epoch = searchContentEpoch(manifest);
  if (state.epoch !== undefined && state.epoch !== epoch) {
    setNoStore(reply);
    throw new EngineError(
      EngineErrorCode.NotFound,
      `search epoch ${state.epoch} no longer current (current=${epoch}) for layer ${layerName} of document ${docId}`,
    );
  }

  await documentService.ensureLayerOnPool(ctx, docId, layerName);
  const build = (jobId: WorkerJobId) =>
    wirePack({
      kind: 'search.query' as const,
      jobId,
      docId,
      layerName,
      request: {
        ...state.query,
        snippets: tier === 'full',
        ...(state.from !== undefined ? { from: toPageRef(state.from) } : {}),
        ...(state.skip > 0 ? { skip: state.skip } : {}),
        ...(state.limit !== undefined ? { limit: state.limit } : {}),
      },
    });
  const result = await documentService.readOnPool(
    ctx,
    docId,
    layerName,
    build,
    abortSignalFromRequest(req),
  );
  if (result.tag !== 'search.query') {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `unexpected search.query payload: ${result.tag}`,
    );
  }

  versioned ? setImmutableCache(reply) : setNoStore(reply);
  const slice = result.slice;
  return {
    ...slice,
    // The worker's session cursor never crosses the wire — continuation
    // is a deterministic next token (same epoch, advanced position).
    nextCursor:
      slice.nextCursor === null
        ? null
        : encodeSearchToken({
            epoch,
            query: state.query,
            ...(state.from !== undefined ? { from: state.from } : {}),
            skip: slice.pagesSearched,
            ...(state.limit !== undefined ? { limit: state.limit } : {}),
          }),
  };
}

function rejectQueryParamsOnTokenUrl(query: unknown): void {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'versioned search URLs must encode the query in the path token, not query params',
    );
  }
}

/**
 * Parse the unversioned form's flat query params. Same field vocabulary
 * as the token, except `q` is plain text (the query string already
 * carries arbitrary text safely) and `epoch` is optional — provide it to
 * get the same stale-version rejection the token form has.
 */
function searchStateFromParams(params: unknown): SearchGetState {
  const p = (params ?? {}) as Record<string, unknown>;
  const str = (key: string): string | undefined => {
    const value = p[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') {
      throw new EngineError(EngineErrorCode.InvalidArg, `search param "${key}" must be a string`);
    }
    return value;
  };
  const bool = (key: string): boolean => {
    const value = str(key);
    if (value === undefined || value === 'false' || value === '0') return false;
    if (value === 'true' || value === '1') return true;
    throw new EngineError(EngineErrorCode.InvalidArg, `search param "${key}" must be a boolean`);
  };
  const int = (key: string, min: number): number | undefined => {
    const value = str(key);
    if (value === undefined) return undefined;
    if (!/^\d+$/.test(value) || Number(value) < min) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `search param "${key}" must be an integer >= ${min}`,
      );
    }
    return Number(value);
  };

  const q = str('q');
  if (q === undefined) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'search param "q" is required');
  }
  // One flat query shape — flags are independent params; semantic
  // validation (regex dialect, regex+matchDiacritics/ignoreWhitespace)
  // happens in the engine's validateSearchQuery, not here.
  const query: SearchQuery = {
    text: q,
    ...(bool('regex') ? { regex: true } : {}),
    ...(bool('matchCase') ? { matchCase: true } : {}),
    ...(bool('matchDiacritics') ? { matchDiacritics: true } : {}),
    ...(bool('wholeWord') ? { wholeWord: true } : {}),
    ...(bool('ignoreWhitespace') ? { ignoreWhitespace: true } : {}),
  };

  const pages = int('limitPages', 1);
  const matches = int('limitMatches', 1);
  return {
    ...(str('epoch') !== undefined ? { epoch: str('epoch') } : {}),
    query,
    ...(int('from', 1) !== undefined ? { from: int('from', 1) } : {}),
    skip: int('skip', 0) ?? 0,
    ...(pages !== undefined || matches !== undefined
      ? {
          limit: {
            ...(matches !== undefined ? { matches } : {}),
            ...(pages !== undefined ? { pages } : {}),
          },
        }
      : {}),
  };
}

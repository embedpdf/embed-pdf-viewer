import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  EngineError,
  EngineErrorCode,
  searchContentEpoch,
  wirePack,
  type SearchMode,
  type SearchQuery,
  type SearchSliceBudget,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import { decodeSearchToken, encodeSearchToken } from '@embedpdf/engine-core/wire';
import { requireLayerDocAccessOnly, requireLayerResource } from '../app/jwt-plugin';
import type { WorkerThreadPool } from '../runtime/WorkerThreadPool';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import {
  abortSignalFromRequest,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
} from './_helpers';

interface SearchRouteDeps {
  documentService: DocumentService;
  pool: WorkerThreadPool;
}

/** Decoded state of one search GET — the whole cache key minus the mode. */
interface SearchGetState {
  /** Content epoch the caller pinned; absent on the unversioned form. */
  epoch?: string;
  query: SearchQuery;
  startPage?: number;
  skip: number;
  budget?: SearchSliceBudget;
}

const RESOURCE_BY_MODE = {
  rects: 'layer-search-rects',
  full: 'layer-search-full',
} as const;

/**
 * Layer-scoped search: one budgeted slice per GET, mirroring the render
 * routes' two forms.
 *
 *   - `/search/{mode}/data@:token` — versioned. The token
 *     (`encodeSearchToken`) carries the content epoch + query + position
 *     and IS the cache key; the response is immutable and CDN-cacheable.
 *     A stale epoch answers `NotFound` (the standard versioned-read
 *     refresh signal), never stale results.
 *   - `/search/{mode}/data?…` — unversioned, flat query params (`q` as
 *     plain text), served from the CURRENT content, always `no-store`.
 *
 * Mode is the PATH, not a parameter: rects and full are separate
 * resources (`layer-search-rects` / `layer-search-full`) with separate
 * capability requirements and separate CDN prefixes, so a credential or
 * cache entry for one tier can never serve the other. `'full'` requires
 * `doc.text.search` AND `doc.text.copy` — a snippet IS extracted text.
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
  for (const mode of ['rects', 'full'] as const) {
    app.get(`/v1/docs/:docId/layers/:layerName/search/${mode}/data@:token`, async (req, reply) => {
      const { token } = req.params as { token: string };
      rejectQueryParamsOnTokenUrl(req.query);
      const decoded = parseTokenOrInvalidArg(decodeSearchToken, token, 'search token');
      return runSearchSlice(deps, req, reply, mode, decoded, true);
    });

    app.get(`/v1/docs/:docId/layers/:layerName/search/${mode}/data`, async (req, reply) => {
      return runSearchSlice(deps, req, reply, mode, searchStateFromParams(req.query), false);
    });
  }
}

async function runSearchSlice(
  deps: SearchRouteDeps,
  req: FastifyRequest,
  reply: FastifyReply,
  mode: SearchMode,
  state: SearchGetState,
  versioned: boolean,
) {
  const { documentService, pool } = deps;
  const { docId, layerName } = req.params as { docId: string; layerName: string };
  const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
  const pdfBits = await documentService.getEffectivePdfBits(accessCtx, docId, layerName);
  const ctx: OpenContext = requireLayerResource(
    req,
    docId,
    layerName,
    RESOURCE_BY_MODE[mode],
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
        query: state.query,
        mode,
        ...(state.startPage !== undefined ? { startPage: state.startPage } : {}),
        ...(state.skip > 0 ? { skip: state.skip } : {}),
        ...(state.budget !== undefined ? { budget: state.budget } : {}),
      },
    });
  const result = await pool.run(docId, build, abortSignalFromRequest(req));
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
    // is a deterministic next TOKEN (same epoch, advanced position).
    nextCursor:
      slice.nextCursor === null
        ? null
        : encodeSearchToken({
            epoch,
            query: state.query,
            ...(state.startPage !== undefined ? { startPage: state.startPage } : {}),
            skip: slice.scannedPages,
            ...(state.budget !== undefined ? { budget: state.budget } : {}),
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
  // validation (regex dialect, regex+matchDiacritics) happens in the
  // engine's validateSearchQuery, not here.
  const query: SearchQuery = {
    text: q,
    ...(bool('regex') ? { regex: true } : {}),
    ...(bool('matchCase') ? { matchCase: true } : {}),
    ...(bool('matchDiacritics') ? { matchDiacritics: true } : {}),
    ...(bool('wholeWord') ? { wholeWord: true } : {}),
  };

  const maxPages = int('maxPages', 1);
  const maxMatches = int('maxMatches', 1);
  return {
    ...(str('epoch') !== undefined ? { epoch: str('epoch') } : {}),
    query,
    ...(int('startPage', 1) !== undefined ? { startPage: int('startPage', 1) } : {}),
    skip: int('skip', 0) ?? 0,
    ...(maxPages !== undefined || maxMatches !== undefined
      ? {
          budget: {
            ...(maxPages !== undefined ? { maxPages } : {}),
            ...(maxMatches !== undefined ? { maxMatches } : {}),
          },
        }
      : {}),
  };
}

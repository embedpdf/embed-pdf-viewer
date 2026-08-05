import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { SearchQuery, SearchRequest } from '@embedpdf/engine-core/runtime';

/**
 * The local engine's resume cursor. Opaque to callers by contract; JSON
 * under the hood because a local cursor never crosses a trust boundary
 * (the server mints its own, authenticated, format for the wire).
 *
 * A cursor pins three things and refuses to resume if any moved:
 *  - the query+mode identity (`key`) — a cursor is not transferable
 *    between queries,
 *  - the document version (`seq`) — resuming over mutated content could
 *    serve stale pages or, worse, text a redaction just removed,
 *  - the scan origin (`start`) — position is meaningless in a different
 *    page order.
 */
export interface SearchCursorState {
  v: 1;
  seq: number;
  key: string;
  /** startPage pon the scan order was rotated to (0 = natural order). */
  start: number;
  /** Pages of the scan order already consumed. */
  scanned: number;
}

/** Stable identity for query + mode (option order pinned by hand). */
export function searchQueryKey(query: SearchQuery, mode: string): string {
  return JSON.stringify([
    query.regex ? 'r' : 'l',
    query.text,
    query.matchCase ? 1 : 0,
    query.matchDiacritics ? 1 : 0,
    query.wholeWord ? 1 : 0,
    mode,
  ]);
}

export function encodeSearchCursor(state: SearchCursorState): string {
  return JSON.stringify(state);
}

export function decodeSearchCursor(
  request: SearchRequest,
  cursor: string,
  expectedSeq: number,
  expectedKey: string,
): SearchCursorState {
  let state: SearchCursorState;
  try {
    state = JSON.parse(cursor) as SearchCursorState;
  } catch {
    throw new EngineError(EngineErrorCode.InvalidArg, 'malformed search cursor');
  }
  if (state?.v !== 1 || typeof state.scanned !== 'number' || typeof state.key !== 'string') {
    throw new EngineError(EngineErrorCode.InvalidArg, 'malformed search cursor');
  }
  if (state.key !== expectedKey) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'search cursor belongs to a different query — restart the search',
    );
  }
  if (state.seq !== expectedSeq) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'document changed since this search cursor was issued — restart the search',
      { details: { cursorSeq: state.seq, currentSeq: expectedSeq } },
    );
  }
  // The cursor owns position; a startPage alongside it is a caller bug.
  if (request.startPage !== undefined && request.startPage !== state.start) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'startPage conflicts with the cursor — omit startPage when resuming',
    );
  }
  return state;
}

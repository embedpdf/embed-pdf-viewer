/**
 * List cursors are opaque `v1.<base64url(JSON)>` tokens over a keyset
 * position `{ s: sort, o: order, k: sort value, id }`, shared by every
 * cursor-paginated admin list (documents, tenants, shares, a document's
 * layers). A cursor continues only the sort and order it was made with.
 * Opaque by contract — the format may change, so clients round-trip
 * `nextCursor` verbatim. Anything that does not decode to a well-formed
 * position fails closed as InvalidArg.
 */

export type ListOrder = 'asc' | 'desc';

export interface SortedListPosition {
  sort: string;
  order: ListOrder;
  key: number | string;
  id: string;
}

export function encodeSortedListCursor(position: SortedListPosition): string {
  const payload = JSON.stringify({
    s: position.sort,
    o: position.order,
    k: position.key,
    id: position.id,
  });
  return `v1.${Buffer.from(payload, 'utf8').toString('base64url')}`;
}

export function decodeSortedListCursor(
  cursor: string,
  expected: { sort: string; order: ListOrder; keyType: 'number' | 'string' },
): { key: number | string; id: string } {
  const parsed = parseCursor(cursor);
  const keyMatches =
    expected.keyType === 'number'
      ? typeof parsed.k === 'number' && Number.isFinite(parsed.k)
      : typeof parsed.k === 'string';
  if (typeof parsed.s !== 'string' || typeof parsed.o !== 'string' || !keyMatches) {
    throw invalidCursor('cursor is malformed; pass a nextCursor value verbatim');
  }
  if (parsed.s !== expected.sort || parsed.o !== expected.order) {
    throw invalidCursor(
      'cursor belongs to a different sort or order; repeat the request without a cursor',
    );
  }
  return { key: parsed.k as number | string, id: parsed.id };
}

/** For lists ordered newest first by creation time. */
export function encodeListCursor(row: { createdAt: number; id: string }): string {
  return encodeSortedListCursor({
    sort: 'createdAt',
    order: 'desc',
    key: row.createdAt,
    id: row.id,
  });
}

export function decodeListCursor(cursor: string): { createdAt: number; id: string } {
  const { key, id } = decodeSortedListCursor(cursor, {
    sort: 'createdAt',
    order: 'desc',
    keyType: 'number',
  });
  return { createdAt: key as number, id };
}

function parseCursor(cursor: string): { s?: unknown; o?: unknown; k?: unknown; id: string } {
  if (cursor.startsWith('v1.')) {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor.slice('v1.'.length), 'base64url').toString('utf8'),
      ) as { s?: unknown; o?: unknown; k?: unknown; id?: unknown };
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof parsed.id === 'string' &&
        parsed.id.length > 0
      ) {
        return { ...parsed, id: parsed.id };
      }
    } catch {
      // fall through to the single failure exit
    }
  }
  throw invalidCursor('cursor is malformed; pass a nextCursor value verbatim');
}

function invalidCursor(message: string): Error {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = 'InvalidArg';
  err.status = 400;
  return err;
}

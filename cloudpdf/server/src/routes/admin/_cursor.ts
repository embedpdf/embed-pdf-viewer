/**
 * List cursors are opaque `v1.<base64url(JSON)>` tokens over a keyset
 * position `{ t: createdAt, id }`, shared by every cursor-paginated
 * admin list (documents, tenants). Opaque by contract — the format may
 * change, so clients round-trip `nextCursor` verbatim. Anything that
 * does not decode to a well-formed v1 position fails closed as
 * InvalidArg.
 */

export function encodeListCursor(row: { createdAt: number; id: string }): string {
  const payload = JSON.stringify({ t: row.createdAt, id: row.id });
  return `v1.${Buffer.from(payload, 'utf8').toString('base64url')}`;
}

export function decodeListCursor(cursor: string): { createdAt: number; id: string } {
  if (cursor.startsWith('v1.')) {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor.slice('v1.'.length), 'base64url').toString('utf8'),
      ) as { t?: unknown; id?: unknown };
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof parsed.t === 'number' &&
        Number.isFinite(parsed.t) &&
        typeof parsed.id === 'string' &&
        parsed.id.length > 0
      ) {
        return { createdAt: parsed.t, id: parsed.id };
      }
    } catch {
      // fall through to the single failure exit
    }
  }
  const err = new Error('cursor is malformed; pass a nextCursor value verbatim') as Error & {
    code: string;
    status: number;
  };
  err.code = 'InvalidArg';
  err.status = 400;
  throw err;
}

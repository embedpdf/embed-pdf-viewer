/**
 * Points in time on the wire are ISO 8601 strings in UTC; the server keeps
 * them as epoch milliseconds (rows) or seconds (JWT `exp`, CDN signatures)
 * and says them here, at the edge.
 */

/** A point in time on the wire, from epoch milliseconds. */
export function isoTime(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

/** {@link isoTime}, or `null` for none. */
export function isoTimeOrNull(milliseconds: number | null): string | null {
  return milliseconds === null ? null : isoTime(milliseconds);
}

/** A point in time on the wire, from epoch seconds (a JWT's `exp`). */
export function isoTimeOfSeconds(seconds: number): string {
  return isoTime(seconds * 1000);
}

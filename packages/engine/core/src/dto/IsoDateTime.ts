/**
 * A moment, as an ISO 8601 string: `2017-07-12T21:44:38-07:00`.
 *
 * Every date in the engine's data has this type. A date read from the PDF
 * keeps the offset it was written with (a PDF date without an offset reads
 * without one); a date the engine makes itself is UTC (`…Z`). A date the PDF
 * writes in a form that can't be parsed reads as `null`. PDF dates have whole
 * seconds, so a fraction is dropped on write.
 *
 * Reads are strings, never `Date` objects: a read must go back into a write
 * as it is, including through JSON, and a `Date` would also drop the offset.
 */
export type IsoDateTime = string;

/** A moment as a write takes it: the same string, or a `Date`, which becomes that string. */
export type DateInput = IsoDateTime | Date;

/**
 * Order two moments by the instant they name. Their text doesn't order them:
 * `2017-07-12T21:44:38-07:00` is later than `2017-07-13T01:00:00Z`.
 */
export function compareIsoDateTime(a: IsoDateTime, b: IsoDateTime): number {
  const difference = Date.parse(a) - Date.parse(b);
  return Number.isNaN(difference) ? 0 : difference;
}

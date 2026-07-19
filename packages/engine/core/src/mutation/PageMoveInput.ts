import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Input to `pages.move()`. Always addresses pages by their durable
 * `pageObjectNumber` — never by `pageIndex`, because a caller queueing
 * multiple moves would have to track index drift between calls
 * otherwise.
 *
 * Semantics mirror PDFium's `FPDF_MovePages`: the supplied pages are
 * detached from their current positions and re-inserted as a contiguous
 * block starting at `destIndex` in the post-removal index space,
 * preserving caller order.
 */
export interface PageMoveInput {
  /**
   * Pages to move, in the order they should appear after the move.
   * Duplicates and unknown PONs are rejected with `EngineError(InvalidArg)`.
   */
  pageObjectNumbers: PageObjectNumber[];
  /**
   * Insertion point in the post-removal index space. Must be in
   * `[0, pageCount - pageObjectNumbers.length]`.
   */
  destIndex: number;
}

import type { PdfRotation } from '../geometry/primitives';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Input to `pages.rotate()`. Rotation is ABSOLUTE ("set to"), never relative
 * ("turn by"): an absolute write is idempotent, so a retried request, an
 * idempotency-keyed replay, or (later) a replayed document event can never
 * double-rotate a page. A caller offering "rotate clockwise" computes
 * `current + 90` from the layout snapshot it already holds and sends the
 * result.
 *
 * One rotation value applies to every listed page (the multi-select
 * thumbnail gesture). Pages are addressed by durable `pageObjectNumber`.
 */
export interface PageRotateInput {
  /**
   * Pages to rotate. Duplicates and unknown PONs are rejected with
   * `EngineError(InvalidArg)` / `EngineError(NotFound)`.
   */
  pageObjectNumbers: PageObjectNumber[];
  /** The absolute rotation to set, in degrees clockwise. */
  rotation: PdfRotation;
}

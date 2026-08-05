import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Input to `pages.delete()`. Pages are addressed by durable
 * `pageObjectNumber`. Deleting every page is rejected with
 * `EngineError(InvalidArg)` — a PDF must keep at least one page.
 */
export interface PageDeleteInput {
  /**
   * Pages to delete. Duplicates and unknown PONs are rejected with
   * `EngineError(InvalidArg)` / `EngineError(NotFound)`.
   */
  pageObjectNumbers: PageObjectNumber[];
}

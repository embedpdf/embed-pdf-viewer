import type { PageRef } from '../identity/PageRef';

/**
 * Opaque token a client must hand back when addressing an annotation by
 * `(page, index)`. The engine validates strict equality against
 * its own `RevisionStore`; mismatches throw `EngineError(InvalidReference)`.
 *
 * Bleed-over prevention: `docSessionId` ties a token to one open session,
 * so a token minted before close-and-reopen is rejected by the new session.
 */
export interface RevisionToken {
  docSessionId: string;
  page: PageRef;
  generation: number;
}

export function revisionTokensEqual(a: RevisionToken, b: RevisionToken): boolean {
  return (
    a.docSessionId === b.docSessionId &&
    a.page.pageObjectNumber === b.page.pageObjectNumber &&
    a.generation === b.generation
  );
}

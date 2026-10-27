/**
 * The redaction page's State table as code: what `useRedactionState()`
 * returns, and the same fields in every other framework. The marks
 * themselves are not here: `usePendingRedactions()` reads them, so a
 * component that only shows the count doesn't re-render for every mark.
 */
import { defineState } from '@embedpdf/core';

import { RedactionToken, type RedactionApplyResult } from './contract';

/** How many marks wait, whether an apply runs, and the last apply's result. */
export interface RedactionState {
  /** How many marks wait to be applied. */
  readonly pendingCount: number;
  /** An apply of this session is running at the engine. */
  readonly applying: boolean;
  /** The last confirmed apply result, from this session or another, or `null`. */
  readonly lastResult: RedactionApplyResult | null;
}

export const redactionState = defineState(RedactionToken, {
  read: (redaction): RedactionState => ({
    pendingCount: redaction.getPendingCount(),
    applying: redaction.isApplying(),
    lastResult: redaction.getLastResult(),
  }),
  empty: {
    pendingCount: 0,
    applying: false,
    lastResult: null,
  },
});

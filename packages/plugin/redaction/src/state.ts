/**
 * The redaction page's State table as code: what `useRedactionState()`
 * returns, and the same fields in every other framework. The marks
 * themselves are not here: `usePendingRedactions()` reads them, so a
 * component that only shows the count doesn't re-render for every mark.
 */
import { defineState } from '@embedpdf/core';

import { RedactionToken } from './contract';

export const redactionState = defineState(RedactionToken, {
  read: (redaction) => ({
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

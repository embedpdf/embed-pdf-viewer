/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { RedactionCapability } from './contract';

export const RedactionToken = createCapabilityToken<RedactionCapability>('redaction', {
  hint: `add redactionPlugin() from '@embedpdf/plugin-redaction' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    markSelection: true,
    markArea: true,
    markPage: true,
    markMatches: true,
    unmark: true,
    clearPending: true,
    updateLabel: true,
    apply: true,
    applyAll: true,
    applyPages: true,
  },
});

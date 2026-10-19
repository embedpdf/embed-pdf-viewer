/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { SelectionCapability } from './contract';

export const SelectionToken = createCapabilityToken<SelectionCapability>('selection', {
  hint: `add selectionPlugin() from '@embedpdf/plugin-selection' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    readText: true,
    readTextInRange: true,
  },
});

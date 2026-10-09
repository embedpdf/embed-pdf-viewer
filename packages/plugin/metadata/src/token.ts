/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { MetadataCapability } from './contract';

export const MetadataToken = createCapabilityToken<MetadataCapability>('metadata', {
  hint: "add metadataPlugin() from '@embedpdf/plugin-metadata' to your plugins list",
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    update: true,
    refresh: true,
    'custom.update': true,
    'custom.refresh': true,
  },
});

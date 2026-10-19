/** The package token, created once here: `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { LinkCapability } from './contract';

export const LinkToken = createCapabilityToken<LinkCapability>('link', {
  hint: `add linkPlugin() from '@embedpdf/plugin-link' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    listAllLinks: true,
    ensureLoaded: true,
  },
});

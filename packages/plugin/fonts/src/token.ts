/** The package token: created once here; `contract.ts` re-exports it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { FontsCapability } from './contract';

export const FontsToken = createCapabilityToken<FontsCapability>('fonts', {
  hint: "add fontsPlugin() from '@embedpdf/plugin-fonts' to your plugins list",
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    ensureLoaded: true,
    refresh: true,
    resolve: true,
    getProgram: true,
  },
});

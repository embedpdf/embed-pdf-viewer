/** The package token, created once here; `contract.ts` re-exports it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { OutlineCapability } from './contract';

export const OutlineToken = createCapabilityToken<OutlineCapability>('outline', {
  hint: "add outlinePlugin() from '@embedpdf/plugin-outline' to your plugins list",
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    ensureLoaded: true,
    refresh: true,
    create: true,
    update: true,
    move: true,
    delete: true,
  },
});

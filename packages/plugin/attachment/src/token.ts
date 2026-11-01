/** The package token, created once here; `contract.ts` re-exports it. */
import { createCapabilityToken } from '@embedpdf/core';

import type { AttachmentCapability } from './contract';

export const AttachmentToken = createCapabilityToken<AttachmentCapability>('attachment', {
  hint: "add attachmentPlugin() from '@embedpdf/plugin-attachment' to your plugins list",
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    ensureLoaded: true,
    refresh: true,
    add: true,
    remove: true,
    download: true,
  },
});

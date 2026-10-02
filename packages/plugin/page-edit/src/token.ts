/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { PageEditCapability } from './contract';

export const PageEditToken = createCapabilityToken<PageEditCapability>('page-edit', {
  hint: `add pageEditPlugin() from '@embedpdf/plugin-page-edit' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    rotateBy: true,
    setRotation: true,
    move: true,
    delete: true,
    insertBlank: true,
    insertFromBytes: true,
    insertFromDocument: true,
    duplicate: true,
    extract: true,
  },
});

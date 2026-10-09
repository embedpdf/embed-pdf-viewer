/** The package token, created once here and re-exported by `contract.ts`. */
import { createCapabilityToken } from '@embedpdf/core';

import type { SignatureCapability } from './contract';

export const SignatureToken = createCapabilityToken<SignatureCapability>('signature', {
  hint: `add signaturePlugin() from '@embedpdf/plugin-signature' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    sign: true,
    prepareSignature: true,
    completeSignature: true,
    cancelPending: true,
    fillField: true,
    clearField: true,
    placeMark: true,
    refresh: true,
    validate: true,
    validateField: true,
    analyzeChanges: true,
    readRevision: true,
  },
});

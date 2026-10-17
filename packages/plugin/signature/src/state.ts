/**
 * The signatures page's State table as code: what `useSignatureState()`
 * returns, and the same fields in every other framework.
 */
import { defineState } from '@embedpdf/core';

import { SignatureToken, type SignatureInfo } from './contract';

const NO_SIGNATURES: readonly SignatureInfo[] = Object.freeze([]);

export const signatureState = defineState(SignatureToken, {
  read: (signature) => ({
    signatures: signature.listSignatures(),
    protection: signature.getProtection(),
    target: signature.getTarget(),
    busy: signature.isBusy(),
    pending: signature.getPending(),
    status: signature.getStatus(),
  }),
  empty: {
    signatures: NO_SIGNATURES,
    protection: null,
    target: null,
    busy: false,
    pending: null,
    status: 'idle',
  },
});

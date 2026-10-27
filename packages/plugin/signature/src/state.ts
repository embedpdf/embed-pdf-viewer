/**
 * The signatures page's State table as code: what `useSignatureState()`
 * returns, and the same fields in every other framework.
 */
import { defineState, type ResourceStatus } from '@embedpdf/core';
import type { DocumentProtection, FormFieldRef } from '@embedpdf/engine-core/runtime';

import { SignatureToken, type SignatureInfo, type SignaturePending } from './contract';

/** The signed fields, what they allow, the target, a signing in progress, and whether they're read. */
export interface SignatureState {
  /** The signed fields, in document order, each with its verdict once checked. */
  readonly signatures: readonly SignatureInfo[];
  /** What the document's signatures allow, or `null` before they're read. */
  readonly protection: DocumentProtection | null;
  /** The field the next picked mark goes to, or `null`. */
  readonly target: FormFieldRef | null;
  /** Whether a signing or a fill is running. */
  readonly busy: boolean;
  /** A signature prepared in two steps and not completed, or `null`. */
  readonly pending: SignaturePending | null;
  /** Whether the signatures are read. */
  readonly status: ResourceStatus;
}

const NO_SIGNATURES: readonly SignatureInfo[] = Object.freeze([]);

export const signatureState = defineState(SignatureToken, {
  read: (signature): SignatureState => ({
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

import type { SignatureDTO } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { readContentsAt, readRevisions, readSignaturesFromModel } from './readSignatureModel';

/** What a completion installed, as the sealed bytes must report it back. */
export interface SealExpectation {
  fieldObjectNumber: number;
  /** The /ByteRange the prepare reported. */
  byteRange: [number, number, number, number];
  /** The CMS written into /Contents. */
  cms: Uint8Array;
}

/**
 * The one check both signing paths make before sealed bytes become a
 * version — the in-session complete and the server's session-less
 * finalize. Reading the result back through the ordinary signature model
 * proves the bytes, not the writer: the field is signed, its signature
 * covers the whole last revision (the candidate's own, never an earlier
 * one), its /ByteRange is the one the digest was computed over, and the
 * /Contents decode to exactly the CMS installed. Anything else is refused
 * and the bytes are never installed.
 */
export function assertSealedSignature(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  model: Ptr,
  expected: SealExpectation,
): SignatureDTO {
  const refuse = (why: string) =>
    new EngineError(EngineErrorCode.SignatureRefused, `the sealed bytes ${why}`);
  const signatures = readSignaturesFromModel(runtime, model);
  const signature = signatures.find(
    (s) =>
      s.field.kind === 'objectNumber' && s.field.fieldObjectNumber === expected.fieldObjectNumber,
  );
  if (!signature) throw refuse('lost the signature field');
  if (!signature.signed || signature.coverage !== 'whole-revision' || !signature.byteRange) {
    throw refuse('do not carry a whole-revision signature on the field');
  }
  if (!sameRange(signature.byteRange, expected.byteRange)) {
    throw refuse(
      `carry /ByteRange [${signature.byteRange.join(' ')}] where [${expected.byteRange.join(' ')}] was sealed`,
    );
  }
  if (!runtime.fn.EPDFSig_IsRevisionChainValid(model)) {
    throw refuse('have a broken cross-reference chain');
  }
  const revisions = readRevisions(runtime, docPtr, signatures);
  if (signature.revisionIndex !== revisions.length - 1) {
    throw refuse('seal an earlier revision than the candidate');
  }
  if (!bytesEqual(readContentsAt(runtime, model, signature.index), expected.cms)) {
    throw refuse('carry /Contents that are not the CMS installed');
  }
  return signature;
}

export function sameRange(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

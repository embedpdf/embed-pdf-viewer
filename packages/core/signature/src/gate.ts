import type { SignaturePrepared } from '@embedpdf/engine-core/runtime';

import type { SignatureProfile } from './cms/build';
import { bytesEqual } from './cms/engine';
import { CmsError, parseCmsInternal } from './cms/parse';
import { verifyCmsSignature } from './cms/verify';
import { checkTimestampToken } from './cms/verify-timestamp';

/**
 * The shape the CMS must have: a PDF signature's (`pkcs7`, `cades-b`), or a
 * document timestamp's RFC 3161 token (`timestamp`).
 */
export type CompletionProfile = SignatureProfile | 'timestamp';

export type CompletionRefusal =
  | 'malformed'
  | 'too-large'
  | 'algorithm-mismatch'
  | 'digest-mismatch'
  | 'signature-invalid'
  | 'profile-violation';

export type CompletionGate =
  | { ok: true }
  | { ok: false; reason: CompletionRefusal; detail: string };

/**
 * The gate between a signer's answer and `signatures.complete`: the CMS
 * must fit the reserved room, hash with the prepared algorithm, carry the
 * prepared digest as its message digest, verify with its own certificate,
 * and match the profile the `/SubFilter` promises (CAdES: ESS
 * signing-certificate-v2 present, no CMS signing-time). A bad CMS never
 * reaches the document.
 */
export async function verifyForCompletion(input: {
  cms: Uint8Array;
  prepared: SignaturePrepared;
  profile: CompletionProfile;
}): Promise<CompletionGate> {
  const { cms, prepared, profile } = input;
  if (cms.byteLength > prepared.contentsSizeBytes) {
    return {
      ok: false,
      reason: 'too-large',
      detail: `the CMS is ${cms.byteLength} bytes; ${prepared.contentsSizeBytes} were reserved`,
    };
  }
  if (profile === 'timestamp') return verifyDocumentTimestamp(cms, prepared);
  let internal;
  try {
    internal = parseCmsInternal(cms);
  } catch (error) {
    return {
      ok: false,
      reason: 'malformed',
      detail: error instanceof CmsError ? error.message : String(error),
    };
  }
  const parsed = internal.parsed;
  if (parsed.digestAlgorithm !== prepared.algorithm) {
    return {
      ok: false,
      reason: 'algorithm-mismatch',
      detail: `the CMS digests with ${parsed.digestAlgorithm}, the document was prepared with ${prepared.algorithm}`,
    };
  }
  if (!bytesEqual(parsed.messageDigest, prepared.digest)) {
    return {
      ok: false,
      reason: 'digest-mismatch',
      detail: 'the CMS message digest is not the prepared digest',
    };
  }
  if (profile === 'cades-b') {
    if (!parsed.signingCertificateV2) {
      return {
        ok: false,
        reason: 'profile-violation',
        detail: 'CAdES requires the ESS signing-certificate-v2 attribute',
      };
    }
    if (parsed.signingTime) {
      return {
        ok: false,
        reason: 'profile-violation',
        detail: 'PAdES forbids the CMS signing-time attribute',
      };
    }
  }
  const cryptography = await verifyCmsSignature(internal);
  if (cryptography !== 'valid') {
    return {
      ok: false,
      reason: 'signature-invalid',
      detail:
        cryptography === 'unsupported'
          ? 'the signature or its certificate binding uses an algorithm that is not supported'
          : 'the signature does not verify',
    };
  }
  return { ok: true };
}

/**
 * A document timestamp's token: it must stamp the prepared digest with the
 * prepared algorithm and pass {@link checkTimestampToken}. A token that
 * can't be checked is refused like a wrong one: the caller asked for this
 * timestamp, and it can't be shown to be one.
 */
async function verifyDocumentTimestamp(
  cms: Uint8Array,
  prepared: SignaturePrepared,
): Promise<CompletionGate> {
  const check = await checkTimestampToken({
    token: cms,
    stamped: { kind: 'digest', digest: prepared.digest, algorithm: prepared.algorithm },
  });
  if (check.verdict === 'valid') return { ok: true };
  switch (check.problem) {
    case 'unreadable':
      return { ok: false, reason: 'malformed', detail: check.detail! };
    case 'no-certificate':
      return {
        ok: false,
        reason: 'malformed',
        detail: "the token does not carry its authority's certificate",
      };
    case 'imprint-algorithm':
      return {
        ok: false,
        reason: 'algorithm-mismatch',
        detail: `the token stamps a ${check.info!.imprintAlgorithm} digest, the document was prepared with ${prepared.algorithm}`,
      };
    case 'imprint':
      return {
        ok: false,
        reason: 'digest-mismatch',
        detail: "the token's message imprint is not the prepared digest",
      };
    default:
      return { ok: false, reason: 'signature-invalid', detail: check.detail! };
  }
}

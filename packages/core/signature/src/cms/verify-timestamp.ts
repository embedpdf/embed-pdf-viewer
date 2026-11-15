/**
 * The one verifier of RFC 3161 timestamp tokens: what signing, the completion gate and reading
 * all ask, so they can't come to different answers about the same token. It is offline and
 * deterministic, and says nothing about trust: whether the authority is one the caller trusts
 * is judged separately, from the certificate this finds.
 */
import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import type * as pkijs from 'pkijs';

import { bytesEqual, ensureEngine, toArrayBuffer } from './engine';
import { WEBCRYPTO_HASH } from './oids';
import {
  CmsError,
  readCmsParts,
  withSignerCertificate,
  type CmsParts,
  type ParsedCmsInternal,
} from './parse';
import { readTimestampInfo, type TimestampInfo } from './timestamp';
import { checkCertificateBinding, verifySignerSignature, type CryptographyVerdict } from './verify';

/**
 * The bytes a signature's timestamp stamps: the contents of the SignerInfo's signature octet
 * string, without its tag and length (RFC 3161 Appendix A). For ECDSA that is the DER
 * signature the CMS carries, not the `r || s` a key returns.
 */
export function signatureValueOf(signerInfo: pkijs.SignerInfo): Uint8Array {
  return new Uint8Array(signerInfo.signature.getValue());
}

/**
 * What a token is expected to stamp: bytes this verifier hashes itself with the token's own
 * algorithm (a signature's value), a digest made elsewhere under a known algorithm (what a
 * document was prepared with), or a digest the caller makes under whichever algorithm the
 * token names (a document's byte ranges, read back).
 */
export type Stamped =
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'digest'; digest: Uint8Array; algorithm: DigestAlgorithm }
  | { kind: 'digest-with'; digest: (algorithm: DigestAlgorithm) => Promise<Uint8Array> };

/**
 * Why a token isn't `valid`. The first five are proof that the token is wrong, and the only
 * reasons a token is `invalid`:
 *
 * - `imprint-algorithm`: it stamps a digest made with another algorithm than the one given;
 * - `imprint`: its imprint isn't the hash of the stamped bytes;
 * - `message-digest`: its message digest doesn't cover its TSTInfo;
 * - `binding`: its certificate binding names another certificate than the one that signed;
 * - `signature`: its signature doesn't verify with the certificate it is bound to.
 *
 * The rest mean the token can't be checked, which is `unsupported` and never `invalid`:
 *
 * - `unreadable`: it doesn't parse as a token;
 * - `no-certificate`: its authority's certificate is neither in the token nor among those offered;
 * - `no-binding`: it binds no certificate at all, which RFC 3161 §2.4.2 requires;
 * - `unsupported-algorithm`: its signature or its binding uses an algorithm unknown here.
 */
export type TimestampProblem =
  | 'imprint-algorithm'
  | 'imprint'
  | 'message-digest'
  | 'binding'
  | 'signature'
  | 'unreadable'
  | 'no-certificate'
  | 'no-binding'
  | 'unsupported-algorithm';

export interface TimestampCheck {
  verdict: CryptographyVerdict;
  /** Why the token isn't `valid`; null when it is. */
  problem: TimestampProblem | null;
  /** The problem in words, for an error message or a verdict's reason. */
  detail: string | null;
  /** What the token asserts, when it could be read that far. */
  info: TimestampInfo | null;
  /** The token with its authority's certificate, when that was found: what trust is judged from. */
  token: ParsedCmsInternal | null;
}

/**
 * Check a timestamp token against what it should stamp. Proof of a wrong token wins over what
 * can't be checked: a token that stamps other bytes is `invalid` even when its certificate is
 * missing.
 */
export async function checkTimestampToken(input: {
  token: Uint8Array;
  stamped: Stamped;
  /** Certificates of the CMS the token sits in: its authority's certificate may be among them. */
  certificates?: pkijs.Certificate[];
}): Promise<TimestampCheck> {
  const engine = ensureEngine();
  let parts: CmsParts;
  let info: TimestampInfo;
  try {
    parts = readCmsParts(input.token, 'tst-info', { certificates: input.certificates });
    info = readTimestampInfo(parts.eContent!);
  } catch (error) {
    const detail = error instanceof CmsError ? error.message : String(error);
    return { verdict: 'unsupported', problem: 'unreadable', detail, info: null, token: null };
  }
  const token = withSignerCertificate(parts);
  const failed = (
    verdict: 'invalid' | 'unsupported',
    problem: TimestampProblem,
    detail: string,
  ): TimestampCheck => ({ verdict, problem, detail, info, token });

  const { stamped } = input;
  if (stamped.kind === 'digest' && info.imprintAlgorithm !== stamped.algorithm) {
    return failed(
      'invalid',
      'imprint-algorithm',
      `the token stamps a ${info.imprintAlgorithm} digest, not the ${stamped.algorithm} digest it was given`,
    );
  }
  const expected =
    stamped.kind === 'digest'
      ? stamped.digest
      : stamped.kind === 'digest-with'
        ? await stamped.digest(info.imprintAlgorithm)
        : new Uint8Array(
            await engine.digest(
              WEBCRYPTO_HASH[info.imprintAlgorithm],
              toArrayBuffer(stamped.bytes),
            ),
          );
  if (!bytesEqual(info.imprint, expected)) {
    return failed('invalid', 'imprint', "the token's message imprint is not the stamped digest");
  }

  const contentDigest = new Uint8Array(
    await engine.digest(WEBCRYPTO_HASH[parts.digestAlgorithm], toArrayBuffer(parts.eContent!)),
  );
  if (!bytesEqual(contentDigest, parts.messageDigest)) {
    return failed(
      'invalid',
      'message-digest',
      "the token's message digest does not cover its TSTInfo",
    );
  }

  if (!token) {
    return failed(
      'unsupported',
      'no-certificate',
      "the token's authority certificate is not carried by the token or by the signature it is in",
    );
  }
  const binding = await checkCertificateBinding(token);
  if (binding === 'invalid') {
    return failed(
      'invalid',
      'binding',
      "the token's certificate binding names another certificate than the one that signed it",
    );
  }
  const signature = await verifySignerSignature(token);
  if (signature === 'invalid') {
    return failed('invalid', 'signature', 'the token signature does not verify');
  }
  if (signature === 'unsupported') {
    return failed(
      'unsupported',
      'unsupported-algorithm',
      "the token's signature algorithm is not supported",
    );
  }
  if (binding === 'absent') {
    return failed(
      'unsupported',
      'no-binding',
      "the token does not bind its authority's certificate, which RFC 3161 requires",
    );
  }
  if (binding === 'unsupported') {
    return failed(
      'unsupported',
      'unsupported-algorithm',
      "the token's certificate binding uses a hash that is not supported",
    );
  }
  return { verdict: 'valid', problem: null, detail: null, info, token };
}

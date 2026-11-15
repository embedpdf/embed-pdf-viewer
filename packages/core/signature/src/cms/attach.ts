import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import { signingRefused } from '../refusal';
import type { CmsSigner } from '../sign';
import { certificateCommonName } from '../signers/self-signed';
import { validateTimestampAuthority, type TrustPort } from '../trust';
import { ensureEngine, toArrayBuffer } from './engine';
import { WEBCRYPTO_HASH } from './oids';
import { CmsError, readCmsParts, type CmsParts } from './parse';
import { addUnsignedAttribute, encodeElement } from './splice';
import { checkTimestampToken, signatureValueOf, type TimestampProblem } from './verify-timestamp';

/** id-aa-signatureTimeStampToken (1.2.840.113549.1.9.16.2.14), as DER. */
const TIMESTAMP_TOKEN_OID = new Uint8Array([
  0x06, 0x0b, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x02, 0x0e,
]);

/**
 * Timestamp a finished CMS signature: ask `authority` for an RFC 3161 token over the signature
 * value, check the token, and add it to the CMS as an unsigned attribute. Every other byte of
 * the CMS stays as it was.
 *
 * This proves the token stamps this CMS's signature value. It can't prove the CMS signs what
 * was prepared, so it never replaces {@link verifyForCompletion}: `completeSignature()` runs
 * the gate on both sides of it.
 *
 * Rejects with `SignatureRefused` when the CMS can't be read (`details.reason: 'malformed'`),
 * when the token doesn't check out or can't be checked (`details.reason`), and when `trust` is
 * given and doesn't trust the token's authority (`details.trust`, `details.trustReason`). A CMS
 * that already carries a timestamp is `InvalidArg`. What the authority itself throws is passed
 * on as it is.
 */
export async function attachSignatureTimestamp(input: {
  cms: Uint8Array;
  authority: CmsSigner;
  /** When given, the token's authority must be trusted by it, or nothing is attached. */
  trust?: TrustPort;
}): Promise<Uint8Array> {
  const { cms, authority } = input;
  let parts: CmsParts;
  try {
    parts = readCmsParts(cms);
  } catch (error) {
    throw signingRefused('malformed', error instanceof CmsError ? error.message : String(error));
  }
  if (parts.timestampTokens.length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'the signature already carries a timestamp, from the service that signed it; leave out `timestampAuthority`',
      { details: { field: 'timestampAuthority' } },
    );
  }

  const algorithm = authority.hash ?? 'sha256';
  const digest = new Uint8Array(
    await ensureEngine().digest(
      WEBCRYPTO_HASH[algorithm],
      toArrayBuffer(signatureValueOf(parts.signerInfo)),
    ),
  );
  const token = await authority.sign({ digest, algorithm, subFilter: 'ETSI.RFC3161' });

  const check = await checkTimestampToken({
    token,
    stamped: { kind: 'digest', digest, algorithm },
    certificates: parts.certificates,
  });
  if (check.verdict !== 'valid') {
    throw signingRefused(refusalFor(check.problem!), `the timestamp: ${detailFor(check)}`);
  }
  if (input.trust) {
    const trust = await validateTimestampAuthority({
      token: check.token!,
      certificates: parts.certificates,
      trust: input.trust,
      genTime: check.info!.genTime,
    });
    if (trust.status !== 'trusted') {
      const name = certificateCommonName(check.token!.parsed.signerCertificate);
      throw new EngineError(
        EngineErrorCode.SignatureRefused,
        `the timestamp's authority${name ? ` ("${name}")` : ''} isn't trusted: ${trust.reason ?? 'no path to a timestamp anchor'}. Add its root to \`timestampAnchors\``,
        { details: { trust: trust.status, trustReason: trust.reason ?? null } },
      );
    }
  }

  try {
    return addUnsignedAttribute(cms, timestampTokenAttribute(token));
  } catch (error) {
    throw signingRefused('malformed', error instanceof CmsError ? error.message : String(error));
  }
}

/** The unsigned attribute a signature carries its timestamp token in, as DER. */
export function timestampTokenAttribute(token: Uint8Array): Uint8Array {
  return encodeElement(
    0x30,
    new Uint8Array([...TIMESTAMP_TOKEN_OID, ...encodeElement(0x31, token)]),
  );
}

/** The completion refusal a token's problem is: a token asked for must verify, or it is refused. */
function refusalFor(problem: TimestampProblem) {
  switch (problem) {
    case 'unreadable':
      return 'malformed';
    case 'imprint':
      return 'digest-mismatch';
    case 'imprint-algorithm':
      return 'algorithm-mismatch';
    default:
      return 'signature-invalid';
  }
}

function detailFor(check: { problem: TimestampProblem | null; detail: string | null }): string {
  return check.problem === 'unreadable'
    ? `\`timestampAuthority\` didn't return an RFC 3161 token (${check.detail}): is it a signing service?`
    : check.detail!;
}

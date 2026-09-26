import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { bytesEqual, ensureEngine, toArrayBuffer } from './engine';
import { WEBCRYPTO_HASH } from './oids';
import { CmsError, parseCmsInternal, type ParsedCmsInternal } from './parse';

export type CryptographyVerdict = 'valid' | 'invalid' | 'unsupported';

/** The DER of the signed attributes as they are signed: re-tagged as a SET. */
export function signedAttributesDer(signerInfo: pkijs.SignerInfo): Uint8Array {
  const set = new asn1js.Set({ value: (signerInfo.signedAttrs?.attributes ?? []).map((a) => a.toSchema()) });
  return new Uint8Array(set.toBER(false));
}

/**
 * Does the CMS's signature verify with the certificate it names, over the
 * attributes it signed? Says nothing about the content: the message digest
 * is compared by the caller (`validateSignatures`, `verifyForCompletion`).
 * `unsupported` means the algorithm is unknown to this engine, which is
 * never `invalid`.
 */
export async function verifyCmsSignature(
  cms: Uint8Array | ParsedCmsInternal,
): Promise<CryptographyVerdict> {
  let internal: ParsedCmsInternal;
  try {
    internal = cms instanceof Uint8Array ? parseCmsInternal(cms) : cms;
  } catch (err) {
    return err instanceof CmsError && err.reason === 'unsupported' ? 'unsupported' : 'invalid';
  }
  const engine = ensureEngine();
  const { signerInfo, signerCertificate, parsed, essCertHash } = internal;

  if (essCertHash) {
    const certHash = new Uint8Array(
      await engine.digest('SHA-256', toArrayBuffer(parsed.signerCertificate)),
    );
    if (!bytesEqual(certHash, essCertHash)) return 'invalid';
  }

  try {
    const ok = await engine.verifyWithPublicKey(
      toArrayBuffer(signedAttributesDer(signerInfo)),
      signerInfo.signature,
      signerCertificate.subjectPublicKeyInfo,
      signerInfo.signatureAlgorithm,
      WEBCRYPTO_HASH[parsed.digestAlgorithm],
    );
    return ok ? 'valid' : 'invalid';
  } catch (err) {
    const message = (err as Error).message ?? '';
    return /unsupported|unknown|not supported|not implemented/i.test(message) ? 'unsupported' : 'invalid';
  }
}

import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { bytesEqual, ensureEngine, toArrayBuffer } from './engine';
import { WEBCRYPTO_HASH } from './oids';
import { CmsError, parseCmsInternal, type ParsedCmsInternal } from './parse';

export type CryptographyVerdict = 'valid' | 'invalid' | 'unsupported';

/** The DER of the signed attributes as they are signed: re-tagged as a set. */
export function signedAttributesDer(signerInfo: pkijs.SignerInfo): Uint8Array {
  const set = new asn1js.Set({
    value: (signerInfo.signedAttrs?.attributes ?? []).map((attribute) => attribute.toSchema()),
  });
  return new Uint8Array(set.toBER(false));
}

/**
 * Does the CMS's signature verify with the certificate it names, over the
 * attributes it signed? Says nothing about the content: the message digest
 * is compared by the caller (`validateSignatures`, `verifyForCompletion`).
 * `unsupported` means an algorithm is unknown to this engine, which is
 * never `invalid`.
 */
export async function verifyCmsSignature(
  cms: Uint8Array | ParsedCmsInternal,
): Promise<CryptographyVerdict> {
  let internal: ParsedCmsInternal;
  try {
    internal = cms instanceof Uint8Array ? parseCmsInternal(cms) : cms;
  } catch (error) {
    return error instanceof CmsError && error.reason === 'unsupported' ? 'unsupported' : 'invalid';
  }
  const binding = await checkCertificateBinding(internal);
  if (binding === 'invalid') return 'invalid';
  const signature = await verifySignerSignature(internal);
  if (signature !== 'valid') return signature;
  return binding === 'unsupported' ? 'unsupported' : 'valid';
}

/**
 * Does the CMS name the certificate that signed it? Every binding it carries whose hash this
 * engine knows must be the hash of the signer's certificate: one that isn't is `invalid`.
 * `absent` when the CMS carries no binding, `unsupported` when it carries only bindings whose
 * hash is unknown.
 */
export async function checkCertificateBinding(
  internal: ParsedCmsInternal,
): Promise<CryptographyVerdict | 'absent'> {
  if (internal.bindings.length === 0) return 'absent';
  const engine = ensureEngine();
  let checked = false;
  for (const binding of internal.bindings) {
    if (!binding.algorithm) continue;
    const certHash = new Uint8Array(
      await engine.digest(
        WEBCRYPTO_HASH[binding.algorithm],
        toArrayBuffer(internal.parsed.signerCertificate),
      ),
    );
    if (!bytesEqual(certHash, binding.certHash)) return 'invalid';
    checked = true;
  }
  return checked ? 'valid' : 'unsupported';
}

/** Does the signature verify with the signer's certificate, over the attributes it signed? */
export async function verifySignerSignature(
  internal: ParsedCmsInternal,
): Promise<CryptographyVerdict> {
  const engine = ensureEngine();
  const { signerInfo, signerCertificate, digestAlgorithm } = internal;
  try {
    const ok = await engine.verifyWithPublicKey(
      toArrayBuffer(signedAttributesDer(signerInfo)),
      signerInfo.signature,
      signerCertificate.subjectPublicKeyInfo,
      signerInfo.signatureAlgorithm,
      WEBCRYPTO_HASH[digestAlgorithm],
    );
    return ok ? 'valid' : 'invalid';
  } catch (error) {
    const message = (error as Error).message ?? '';
    return /unsupported|unknown|not supported|not implemented/i.test(message)
      ? 'unsupported'
      : 'invalid';
  }
}

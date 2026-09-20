import * as pkijs from 'pkijs';

import { ensureEngine, toArrayBuffer } from './cms/engine';
import { parseCmsInternal, type ParsedCmsInternal } from './cms/parse';

/**
 * Where trust comes from. The engine has no opinion: an application
 * supplies its anchors (a company root, a national trust list, the AATL).
 */
export interface TrustPort {
  /** DER certificates trusted as anchors. */
  anchors(): Promise<Uint8Array[]>;
}

/**
 * When a chain is judged. `now` is the honest default; `timestamp` is only
 * legitimate for a verified RFC 3161 token, which is why it carries the
 * proof flag. The signature's own `/M` is a claim and never a validation
 * time.
 */
export type ValidationTime =
  | { kind: 'now' }
  | { kind: 'timestamp'; genTime: Date; tokenVerified: true };

export type TrustStatus = 'trusted' | 'untrusted' | 'unknown';

export interface TrustVerdict {
  status: TrustStatus;
  /** Why, when not trusted. */
  reason?: string;
  /** DER certificates of the validated path, anchor last, when trusted. */
  path?: Uint8Array[];
}

/**
 * Build and validate the certificate path from the CMS's signer to one
 * of the port's anchors at `at`. No port, or a port with no anchors, is
 * `unknown`: nothing was checked, and nothing was refused.
 */
export async function validateChain(
  cms: Uint8Array | ParsedCmsInternal,
  trust: TrustPort | null | undefined,
  at: ValidationTime = { kind: 'now' },
): Promise<TrustVerdict> {
  if (!trust) return { status: 'unknown', reason: 'no trust anchors configured' };
  const anchors = await trust.anchors();
  if (anchors.length === 0) return { status: 'unknown', reason: 'no trust anchors configured' };
  ensureEngine();
  let internal: ParsedCmsInternal;
  try {
    internal = cms instanceof Uint8Array ? parseCmsInternal(cms) : cms;
  } catch (err) {
    return { status: 'untrusted', reason: (err as Error).message };
  }
  const trustedCerts = anchors.map((der) => pkijs.Certificate.fromBER(toArrayBuffer(der)));
  const chainEngine = new pkijs.CertificateChainValidationEngine({
    certs: internal.certificates,
    trustedCerts,
    checkDate: at.kind === 'now' ? new Date() : at.genTime,
  });
  try {
    const result = await chainEngine.verify();
    if (!result.result) {
      return { status: 'untrusted', reason: result.resultMessage || `chain validation code ${result.resultCode}` };
    }
    return {
      status: 'trusted',
      path: (result.certificatePath ?? []).map((c) => new Uint8Array(c.toSchema(true).toBER(false))),
    };
  } catch (err) {
    return { status: 'untrusted', reason: (err as Error).message };
  }
}

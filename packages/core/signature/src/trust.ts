import * as pkijs from 'pkijs';

import { bytesEqual, ensureEngine } from './cms/engine';
import { OID } from './cms/oids';
import { certDer, certificateFromDer, parseCmsInternal, type ParsedCmsInternal } from './cms/parse';
import { certificateCommonName } from './signers/self-signed';

/**
 * Where trust comes from. The engine has no opinion: an application
 * supplies its anchors (a company root, a national trust list, the AATL).
 */
export interface TrustPort {
  /** DER certificates trusted as anchors. */
  anchors(): Promise<Uint8Array[]>;
  /**
   * DER certificates trusted as anchors for timestamp authorities: who may say what time it
   * was, apart from who may say who signed. A port that has this member judges authorities
   * against it alone, so an authority's root never vouches for a signer. A port without it
   * judges authorities against `anchors()`.
   */
  timestampAnchors?(): Promise<Uint8Array[]>;
}

/**
 * When a chain is judged. `now` is the honest default; `timestamp` is only
 * legitimate for a verified RFC 3161 token, which is why it carries the
 * proof flag; its `genTime` is the token's time as an ISO 8601 string. The
 * signature's own `/M` is a claim and never a validation time.
 */
export type ValidationTime =
  | { kind: 'now' }
  | { kind: 'timestamp'; genTime: string; tokenVerified: true };

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
  trust: TrustPort | null,
  at: ValidationTime = { kind: 'now' },
): Promise<TrustVerdict> {
  if (!trust) return { status: 'unknown', reason: 'no trust anchors configured' };
  const anchors = await trust.anchors();
  if (anchors.length === 0) return { status: 'unknown', reason: 'no trust anchors configured' };
  ensureEngine();
  let internal: ParsedCmsInternal;
  try {
    internal = cms instanceof Uint8Array ? parseCmsInternal(cms) : cms;
  } catch (error) {
    return { status: 'untrusted', reason: (error as Error).message };
  }
  return validatePath({
    target: internal.signerCertificate,
    candidates: internal.certificates,
    anchors,
    at: timeOf(at),
  });
}

/**
 * Is a timestamp token's authority one the port trusts to say what time it was? Its certificate
 * must be made for timestamping and nothing else, in a critical extension (RFC 3161 §2.3); the
 * token must be dated inside that certificate's validity; and the certificate must be one of the
 * port's timestamp anchors or lead to one, valid at `at`.
 *
 * A certificate that is itself an anchor is trusted without a path: that is what listing it
 * means, and a self-signed authority has no other way to be trusted, since a certificate made
 * for timestamping can't also be a certificate authority.
 */
export async function validateTimestampAuthority(input: {
  /** The token with its authority's certificate. */
  token: ParsedCmsInternal;
  /** Certificates of the signature the token sits in: an issuer may be among them. */
  certificates?: pkijs.Certificate[];
  trust: TrustPort | null;
  at?: ValidationTime;
  /** The time the token asserts. */
  genTime: Date;
}): Promise<TrustVerdict> {
  const { token, trust, genTime } = input;
  if (!trust) return { status: 'unknown', reason: 'no trust anchors configured' };
  const anchors = trust.timestampAnchors ? await trust.timestampAnchors() : await trust.anchors();
  if (anchors.length === 0) {
    return {
      status: 'unknown',
      reason: trust.timestampAnchors
        ? 'no timestamp anchors configured'
        : 'no trust anchors configured',
    };
  }
  ensureEngine();
  const authority = token.signerCertificate;
  const purpose = timestampingPurposeProblem(authority);
  if (purpose) return { status: 'untrusted', reason: purpose };
  if (!validAt(authority, genTime)) {
    return {
      status: 'untrusted',
      reason: "the token is dated outside its authority certificate's validity",
    };
  }
  const at = timeOf(input.at ?? { kind: 'now' });
  const authorityDer = certDer(authority);
  if (anchors.some((anchor) => bytesEqual(anchor, authorityDer))) {
    return validAt(authority, at)
      ? { status: 'trusted', path: [authorityDer] }
      : {
          status: 'untrusted',
          reason: "the authority's certificate is not valid at the time it is judged",
        };
  }
  return validatePath({
    target: authority,
    candidates: [...token.certificates, ...(input.certificates ?? [])],
    anchors,
    at,
  });
}

function timeOf(at: ValidationTime): Date {
  return at.kind === 'now' ? new Date() : new Date(at.genTime);
}

function validAt(certificate: pkijs.Certificate, at: Date): boolean {
  return certificate.notBefore.value <= at && at <= certificate.notAfter.value;
}

/**
 * Why a certificate may not issue timestamps, or null when it may: it must carry the
 * timestamping purpose and no other, in an extended key usage marked critical (RFC 3161 §2.3).
 */
function timestampingPurposeProblem(certificate: pkijs.Certificate): string | null {
  const extension = certificate.extensions?.find(
    (candidate) => candidate.extnID === OID.extendedKeyUsage,
  );
  if (!extension) {
    return "the authority's certificate has no extended key usage, so it is not made for timestamping";
  }
  const purposes = (extension.parsedValue as pkijs.ExtKeyUsage | undefined)?.keyPurposes ?? [];
  if (!purposes.includes(OID.timeStamping)) {
    return "the authority's certificate does not allow timestamping";
  }
  if (purposes.length > 1) {
    return "the authority's certificate allows other uses besides timestamping";
  }
  if (!extension.critical) {
    return "the authority's certificate does not mark its timestamping purpose as critical";
  }
  return null;
}

/**
 * Does a path lead from `target` to one of `anchors`, valid at `at`? The path validated is the
 * target's own. PKI.js validates the last certificate it is handed, and drops a certificate it
 * is handed twice, so the target goes last and alone, and the path that comes back must begin
 * with it: another certificate in the same CMS reaching an anchor proves nothing about the one
 * that signed.
 */
async function validatePath(input: {
  target: pkijs.Certificate;
  /** Certificates a path may pass through; the target itself may be among them. */
  candidates: pkijs.Certificate[];
  anchors: Uint8Array[];
  at: Date;
}): Promise<TrustVerdict> {
  const { target, at } = input;
  const targetDer = certDer(target);
  const isTarget = (der: Uint8Array) => bytesEqual(der, targetDer);
  const others = input.candidates.filter((candidate) => !isTarget(certDer(candidate)));
  const targetIsAnchor = input.anchors.some(isTarget);
  try {
    const otherAnchors = input.anchors
      .filter((anchor) => !isTarget(anchor))
      .map(certificateFromDer);
    // A target that is itself an anchor is handed over as the last trusted certificate too: its
    // second copy is the one dropped, which leaves the first one last.
    const chainEngine = new pkijs.CertificateChainValidationEngine({
      certs: targetIsAnchor ? [target] : [...others, target],
      trustedCerts: targetIsAnchor ? [...otherAnchors, target] : otherAnchors,
      checkDate: at,
    });
    const result = await chainEngine.verify();
    if (!result.result) {
      const orphan = firstWithoutIssuer(target, [...others, ...otherAnchors]);
      return {
        status: 'untrusted',
        reason: orphan
          ? `no certificate was found that issued "${nameOf(orphan)}"`
          : result.resultMessage || `chain validation code ${result.resultCode}`,
      };
    }
    const path = result.certificatePath ?? [];
    if (path.length === 0 || !isTarget(certDer(path[0]!))) {
      return {
        status: 'untrusted',
        reason: 'the validated path does not begin with the certificate that signed',
      };
    }
    return { status: 'trusted', path: path.map(certDer) };
  } catch (error) {
    return { status: 'untrusted', reason: (error as Error).message };
  }
}

/**
 * The first certificate on the way up from `target` whose issuer is not in `pool`, or null when
 * the way ends at a certificate that issued itself.
 */
function firstWithoutIssuer(
  target: pkijs.Certificate,
  pool: pkijs.Certificate[],
): pkijs.Certificate | null {
  const visited = new Set<pkijs.Certificate>();
  let current = target;
  while (!visited.has(current)) {
    visited.add(current);
    if (current.issuer.isEqual(current.subject)) return null;
    const issuer = pool.find((candidate) => candidate.subject.isEqual(current.issuer));
    if (!issuer) return current;
    current = issuer;
  }
  return null;
}

function nameOf(certificate: pkijs.Certificate): string {
  return certificateCommonName(certDer(certificate)) ?? 'a certificate without a common name';
}

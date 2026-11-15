/**
 * Everything a document offers for checking its signatures: certificates, OCSP responses and
 * CRLs, wherever they sit. Nothing in it is trusted for where it was found. A certificate is
 * only ever a candidate for a path, and an answer is checked by its own signature every time
 * it is asked about a certificate.
 */
import { EngineError, EngineErrorCode, type DocumentHandle } from '@embedpdf/engine-core/runtime';
import type * as pkijs from 'pkijs';

import { bytesEqual, toHex } from '../cms/engine';
import { certDer, certificateFromDer, type CarriedRevocation } from '../cms/parse';
import { certificateCommonName } from '../signers/self-signed';
import { checkRevocationAnswer, type RevocationAnswer, type RevocationAnswerCheck } from './answer';
import { revocationStatusAt, type RevocationStatus } from './status';

export class ValidationPool {
  private readonly certificateByDer = new Map<string, pkijs.Certificate>();
  private readonly answerByDer = new Map<string, RevocationAnswer>();
  /** What every answer says about one certificate, by the certificate and its issuer. */
  private readonly checked = new Map<string, Promise<RevocationAnswerCheck[]>>();

  /** Every certificate offered, each once. */
  get certificates(): pkijs.Certificate[] {
    return [...this.certificateByDer.values()];
  }

  /** Offer a certificate. Bytes that are not a certificate are left out. */
  addCertificate(certificate: pkijs.Certificate | Uint8Array): void {
    try {
      const der = certificate instanceof Uint8Array ? certificate : certDer(certificate);
      const key = toHex(der);
      if (this.certificateByDer.has(key)) return;
      this.certificateByDer.set(
        key,
        certificate instanceof Uint8Array ? certificateFromDer(certificate) : certificate,
      );
    } catch {
      // Not a certificate: it can't be part of a path.
    }
  }

  /** Offer an answer as it was stored. It is checked when it is asked about a certificate. */
  addAnswer(kind: RevocationAnswer['kind'], der: Uint8Array): void {
    const key = `${kind}:${toHex(der)}`;
    if (!this.answerByDer.has(key)) this.answerByDer.set(key, { kind, der });
  }

  /** Offer what a CMS carries itself: its certificates and its answers. */
  addCarried(certificates: readonly pkijs.Certificate[], revocation: CarriedRevocation): void {
    for (const certificate of certificates) this.addCertificate(certificate);
    for (const der of revocation.ocspResponses) this.addAnswer('ocsp', der);
    for (const der of revocation.crls) this.addAnswer('crl', der);
  }

  /** What each answer says about `certificate`, which `issuer` issued. Checked once. */
  checksFor(
    certificate: pkijs.Certificate,
    issuer: pkijs.Certificate,
  ): Promise<RevocationAnswerCheck[]> {
    const key = `${toHex(certDer(certificate))}:${toHex(certDer(issuer))}`;
    let checks = this.checked.get(key);
    if (!checks) {
      checks = Promise.all(
        [...this.answerByDer.values()].map((answer) =>
          checkRevocationAnswer({ answer, certificate, issuer }),
        ),
      );
      this.checked.set(key, checks);
    }
    return checks;
  }
}

/**
 * The pool of a document: what its validation data holds (its security store), read as the
 * document is now. What its signatures carry themselves is added by the caller, as each CMS is
 * read. An engine that can't read validation data offers none.
 */
export async function readValidationPool(doc: DocumentHandle): Promise<ValidationPool> {
  const pool = new ValidationPool();
  if (typeof doc.signatures?.getValidationInfo !== 'function') return pool;
  try {
    const stored = await doc.signatures.getValidationInfo();
    for (const der of stored.certificates) pool.addCertificate(der);
    for (const der of stored.ocspResponses) pool.addAnswer('ocsp', der);
    for (const der of stored.crls) pool.addAnswer('crl', der);
  } catch (error) {
    if (!EngineError.is(error, EngineErrorCode.NotImplemented)) throw error;
  }
  return pool;
}

/** What the pool says about one certificate of a path, at a moment. */
export interface CertificateRevocation extends RevocationStatus {
  /** DER of the certificate asked about. */
  certificate: Uint8Array;
  /** Its common name, or null when it has none. */
  name: string | null;
}

/**
 * What the pool's answers say, at `at`, about each certificate of a validated path that can be
 * withdrawn: every one below the last, which is the certificate that is trusted. A path of one
 * certificate, trusted as it is, has nothing to ask about.
 */
export async function pathRevocation(
  pool: ValidationPool,
  path: readonly Uint8Array[],
  at: Date,
): Promise<CertificateRevocation[]> {
  // A certificate that is its own anchor comes back from path validation twice in a row: it
  // is one certificate, and the one that is trusted.
  const links = path.filter((der, index) => index === 0 || !bytesEqual(der, path[index - 1]!));
  const certificates = links.map(certificateFromDer);
  const rows: CertificateRevocation[] = [];
  for (let index = 0; index + 1 < certificates.length; index++) {
    const checks = await pool.checksFor(certificates[index]!, certificates[index + 1]!);
    rows.push({
      certificate: links[index]!,
      name: certificateCommonName(links[index]!),
      ...revocationStatusAt(checks, at),
    });
  }
  return rows;
}

/**
 * One answer for a whole path: `revoked` when any certificate was withdrawn by then, `good`
 * when every one has an answer that says good, `unknown` otherwise. `reason` names the
 * certificate that decided it, and is null for `good`. `when` names the time the rows were
 * judged at, for the reason: "now", or a time.
 */
export function summarizeRevocation(
  rows: readonly CertificateRevocation[],
  when: string,
): { status: RevocationStatus['status']; reason: string | null } {
  const named = (row: CertificateRevocation) => `"${row.name ?? 'a certificate without a name'}"`;
  const revoked = rows.find((row) => row.status === 'revoked');
  if (revoked) {
    const answer = revoked.answer;
    const on = answer?.says === 'revoked' ? ` on ${answer.revokedAt.toISOString()}` : '';
    const why = answer?.says === 'revoked' && answer.reason ? ` (${answer.reason})` : '';
    return { status: 'revoked', reason: `${named(revoked)} was withdrawn${on}${why}` };
  }
  const unknown = rows.find((row) => row.status === 'unknown');
  if (unknown) {
    return { status: 'unknown', reason: `no answer about ${named(unknown)} speaks for ${when}` };
  }
  return { status: 'good', reason: null };
}

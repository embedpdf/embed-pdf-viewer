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
import { cannotBeRevoked } from './addresses';
import { checkRevocationAnswer, type RevocationAnswer, type RevocationAnswerCheck } from './answer';
import { revocationStatusAt, type RevocationStatus } from './status';

/** An answer in the pool, and whether the document already holds it. */
export interface PooledAnswer extends RevocationAnswer {
  /** False for an answer that came from outside the file: one a caller knew, or one that was fetched. */
  inFile: boolean;
}

export class ValidationPool {
  private readonly certificateByDer = new Map<
    string,
    { certificate: pkijs.Certificate; inFile: boolean }
  >();
  private readonly answerByDer = new Map<string, PooledAnswer>();
  /** What each answer says about one certificate, in the order the answers were offered. */
  private readonly checked = new Map<string, Promise<RevocationAnswerCheck>[]>();

  /** Every certificate offered, each once. */
  get certificates(): pkijs.Certificate[] {
    return [...this.certificateByDer.values()].map((entry) => entry.certificate);
  }

  /**
   * Offer a certificate. Bytes that are not a certificate are left out, and false comes back.
   * `inFile` is false for one that came from outside the file.
   */
  addCertificate(certificate: pkijs.Certificate | Uint8Array, inFile = true): boolean {
    try {
      const der = certificate instanceof Uint8Array ? certificate : certDer(certificate);
      const key = toHex(der);
      if (this.certificateByDer.has(key)) return true;
      this.certificateByDer.set(key, {
        certificate:
          certificate instanceof Uint8Array ? certificateFromDer(certificate) : certificate,
        inFile,
      });
      return true;
    } catch {
      // Not a certificate: it can't be part of a path.
      return false;
    }
  }

  /**
   * Offer an answer as it was stored or sent. It is checked when it is asked about a
   * certificate. `inFile` is false for one that came from outside the file.
   */
  addAnswer(kind: RevocationAnswer['kind'], der: Uint8Array, inFile = true): PooledAnswer {
    const key = `${kind}:${toHex(der)}`;
    let answer = this.answerByDer.get(key);
    if (!answer) {
      answer = { kind, der, inFile };
      this.answerByDer.set(key, answer);
    }
    return answer;
  }

  /** Offer what a CMS carries itself: its certificates and its answers. */
  addCarried(certificates: readonly pkijs.Certificate[], revocation: CarriedRevocation): void {
    for (const certificate of certificates) this.addCertificate(certificate);
    for (const der of revocation.ocspResponses) this.addAnswer('ocsp', der);
    for (const der of revocation.crls) this.addAnswer('crl', der);
  }

  /**
   * What each answer says about `certificate`, which `issuer` issued. Each answer is checked
   * once, also when more answers are offered between two calls.
   */
  async checksFor(
    certificate: pkijs.Certificate,
    issuer: pkijs.Certificate,
  ): Promise<{ answer: PooledAnswer; check: RevocationAnswerCheck }[]> {
    const key = `${toHex(certDer(certificate))}:${toHex(certDer(issuer))}`;
    const answers = [...this.answerByDer.values()];
    const checks = this.checked.get(key) ?? [];
    for (let index = checks.length; index < answers.length; index++) {
      checks.push(checkRevocationAnswer({ answer: answers[index]!, certificate, issuer }));
    }
    this.checked.set(key, checks);
    const done = await Promise.all(checks);
    return answers.map((answer, index) => ({ answer, check: done[index]! }));
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
  /** DER of the certificate that issued it: the next one of the path. */
  issuer: Uint8Array;
  /** The answer that decided it, as it is stored; null for `unknown`. */
  evidence: PooledAnswer | null;
}

/**
 * What the pool's answers say, at `at`, about each certificate of a validated path that can be
 * withdrawn: every one below the last, which is the certificate that is trusted. A path of one
 * certificate, trusted as it is, has nothing to ask about, and neither has a certificate that
 * says it can't be withdrawn (`cannotBeRevoked`): it has no row, so nothing is asked about it
 * and nothing about it is missing.
 */
export async function pathRevocation(
  pool: ValidationPool,
  path: readonly Uint8Array[],
  at: Date,
  /** `'file'` leaves out the answers that came from outside the file. */
  from: 'anywhere' | 'file' = 'anywhere',
): Promise<CertificateRevocation[]> {
  // A certificate that is its own anchor comes back from path validation twice in a row: it
  // is one certificate, and the one that is trusted.
  const links = path.filter((der, index) => index === 0 || !bytesEqual(der, path[index - 1]!));
  const certificates = links.map(certificateFromDer);
  const rows: CertificateRevocation[] = [];
  for (let index = 0; index + 1 < certificates.length; index++) {
    if (cannotBeRevoked(certificates[index]!)) continue;
    const checked = (await pool.checksFor(certificates[index]!, certificates[index + 1]!)).filter(
      (entry) => from === 'anywhere' || entry.answer.inFile,
    );
    const status = revocationStatusAt(
      checked.map((entry) => entry.check),
      at,
    );
    rows.push({
      certificate: links[index]!,
      name: certificateCommonName(links[index]!),
      issuer: links[index + 1]!,
      evidence: checked.find((entry) => entry.check === status.answer)?.answer ?? null,
      ...status,
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

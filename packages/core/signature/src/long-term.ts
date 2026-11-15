/**
 * Whether a file holds everything a reader needs to check a signature with no network: what
 * Acrobat calls "LTV enabled". It is judged at the time a timestamp proves, never at "now": a
 * stored answer says a certificate was good when it signed, and says nothing about today.
 */
import { toHex } from './cms/engine';
import { certificateFromDer } from './cms/parse';
import { pathRevocation, type CertificateRevocation, type ValidationPool } from './revocation/pool';

/** Whether a certificate was withdrawn, at the time it is judged. */
export type RevocationVerdict = 'good' | 'revoked' | 'unknown';

/**
 * Why a signature can't be checked from the file alone.
 *
 * - `no-timestamp`: no timestamp you trust covers it, so no time is proven to judge it at;
 * - `untrusted`: the certificate doesn't lead to one you trust;
 * - `no-answer`: the file holds no answer that says the certificate was good at that time;
 * - `revoked`: an answer in the file says the certificate was withdrawn by then.
 */
export type LongTermGapReason = 'no-timestamp' | 'untrusted' | 'no-answer' | 'revoked';

export interface LongTermGap {
  /** The certificate it is about: its common name, or null when it has none. */
  certificate: string | null;
  reason: LongTermGapReason;
}

export interface LongTermVerdict {
  /**
   * A timestamp you trust covers the signature, the signer was trusted at that time, and the
   * file holds an answer that says good for every certificate that can be withdrawn: the
   * signer's path and the timestamp authority's, below the certificates you trust.
   */
  enabled: boolean;
  /**
   * The time the signature is proven to have existed by (ISO 8601), which it was judged at:
   * that of the earliest trusted timestamp that covers it, or null.
   */
  provenAt: string | null;
  /**
   * When the proof the file carries by itself runs out (ISO 8601): the day the certificate of
   * the last trusted timestamp covering the signature expires. The signature does not become
   * invalid then; the proof of when it was made gets weaker. Null when not enabled.
   */
  expiresAt: string | null;
  /**
   * The time of the last trusted document timestamp added after the signature (ISO 8601), or
   * null when none covers it. With one, a strict validator has proof of when the stored
   * answers existed; without one, it has the signature's own timestamp only.
   */
  documentTimestampedAt: string | null;
  /** What stands in the way, one entry per certificate. Empty when enabled. */
  missing: LongTermGap[];
}

/** A timestamp whose token verifies and whose authority is trusted: a time that is proven. */
export interface ProvenTime {
  genTime: string;
  /** The authority's validated path, anchor last. */
  path: Uint8Array[];
  /** DER of the authority's certificate. */
  authorityCertificate: Uint8Array;
}

/** A trusted document timestamp, with the revision it sealed. */
export interface ProvenDocumentTimestamp extends ProvenTime {
  revisionIndex: number;
}

export interface LongTermInput {
  /** `signature`: its signer's path is asked about too. `timestamp`: only its authority's. */
  kind: 'signature' | 'timestamp';
  /** The revision the signature sealed; null when it seals none. */
  revisionIndex: number | null;
  /** The name to give a gap that is about the signature as a whole. */
  subject: string | null;
  /** The timestamp the signature is judged at, under `earliest-timestamp`; null without one. */
  reliesOn: ProvenTime | null;
  /** Why there is no such timestamp, when there is none. */
  withoutTime: 'no-timestamp' | 'untrusted';
  /** Whether the signer is trusted at that time, with the validated path. Unused for a timestamp. */
  signer: { trusted: boolean; path: Uint8Array[] | null };
  /** Every trusted document timestamp of the file. */
  documentTimestamps: readonly ProvenDocumentTimestamp[];
  pool: ValidationPool;
  /**
   * `'file'`: only the answers the file holds count, which is what the verdict is about.
   * `'anywhere'`: answers from outside count too, for working out what storing them would do.
   */
  answersFrom: 'file' | 'anywhere';
}

/** A long-term verdict with what it was worked out from, for the code that fills the gaps. */
export interface LongTermFindings {
  verdict: LongTermVerdict;
  /** What the file says about each certificate that needs an answer, the good ones included. */
  rows: CertificateRevocation[];
  /** `verdict.missing`, each with the DER of the certificate it is about when it is about one. */
  gaps: (LongTermGap & { der: Uint8Array | null })[];
}

export async function longTermVerdict(input: LongTermInput): Promise<LongTermVerdict> {
  return (await longTermFindings(input)).verdict;
}

export async function longTermFindings(input: LongTermInput): Promise<LongTermFindings> {
  const covering =
    input.revisionIndex === null
      ? []
      : input.documentTimestamps.filter((stamp) => stamp.revisionIndex > input.revisionIndex!);
  const lastOf = <T extends ProvenTime>(stamps: readonly T[]): T | null =>
    stamps.reduce<T | null>(
      (last, stamp) => (!last || stamp.genTime > last.genTime ? stamp : last),
      null,
    );
  const documentTimestampedAt = lastOf(covering)?.genTime ?? null;
  const without = (
    provenAt: string | null,
    gaps: LongTermFindings['gaps'],
    rows: CertificateRevocation[] = [],
  ): LongTermFindings => ({
    verdict: {
      enabled: false,
      provenAt,
      expiresAt: null,
      documentTimestampedAt,
      missing: gaps.map(({ certificate, reason }) => ({ certificate, reason })),
    },
    rows,
    gaps,
  });

  const proven = input.reliesOn;
  if (!proven) {
    return without(null, [{ certificate: input.subject, reason: input.withoutTime, der: null }]);
  }
  if (input.kind === 'signature' && (!input.signer.trusted || !input.signer.path)) {
    return without(proven.genTime, [
      { certificate: input.subject, reason: 'untrusted', der: null },
    ]);
  }

  // Each certificate at the time it signed: the signer's path at the proven time, the
  // authority's path at the time of its own token, which is that same time.
  const at = new Date(proven.genTime);
  const all: CertificateRevocation[] = [
    ...(input.kind === 'signature'
      ? await pathRevocation(input.pool, input.signer.path!, at, input.answersFrom)
      : []),
    ...(await pathRevocation(input.pool, proven.path, at, input.answersFrom)),
  ];
  // A certificate on both paths is asked about once.
  const seen = new Set<string>();
  const rows = all.filter((row) => {
    const key = toHex(row.certificate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const gaps = rows
    .filter((row) => row.status !== 'good')
    .map((row) => ({
      certificate: row.name,
      reason: row.status === 'revoked' ? ('revoked' as const) : ('no-answer' as const),
      der: row.certificate,
    }));
  if (gaps.length > 0) return without(proven.genTime, gaps, rows);

  const last = lastOf([proven, ...covering])!;
  return {
    verdict: {
      enabled: true,
      provenAt: proven.genTime,
      expiresAt: certificateFromDer(last.authorityCertificate).notAfter.value.toISOString(),
      documentTimestampedAt,
      missing: [],
    },
    rows,
    gaps: [],
  };
}

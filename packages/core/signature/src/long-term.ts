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
  /** The time it was judged at (ISO 8601): the earliest trusted timestamp that covers it, or null. */
  at: string | null;
  /**
   * How long the file proves this by itself (ISO 8601): the day the certificate of the last
   * trusted timestamp covering the signature expires. Null when not enabled.
   */
  until: string | null;
  /**
   * The time of the last trusted document timestamp added after the signature (ISO 8601), or
   * null when none covers it. With one, a strict validator has proof of when the stored
   * answers existed; without one, it has the signature's own timestamp only.
   */
  documentTimestamp: string | null;
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
}

export async function longTermVerdict(input: LongTermInput): Promise<LongTermVerdict> {
  const covering =
    input.revisionIndex === null
      ? []
      : input.documentTimestamps.filter((stamp) => stamp.revisionIndex > input.revisionIndex!);
  const lastOf = <T extends ProvenTime>(stamps: readonly T[]): T | null =>
    stamps.reduce<T | null>(
      (last, stamp) => (!last || stamp.genTime > last.genTime ? stamp : last),
      null,
    );
  const documentTimestamp = lastOf(covering)?.genTime ?? null;
  const without = (at: string | null, missing: LongTermGap[]): LongTermVerdict => ({
    enabled: false,
    at,
    until: null,
    documentTimestamp,
    missing,
  });

  const proven = input.reliesOn;
  if (!proven) return without(null, [{ certificate: input.subject, reason: input.withoutTime }]);
  if (input.kind === 'signature' && (!input.signer.trusted || !input.signer.path)) {
    return without(proven.genTime, [{ certificate: input.subject, reason: 'untrusted' }]);
  }

  // Each certificate at the time it signed: the signer's path at the proven time, the
  // authority's path at the time of its own token, which is that same time.
  const at = new Date(proven.genTime);
  const rows: CertificateRevocation[] = [
    ...(input.kind === 'signature' ? await pathRevocation(input.pool, input.signer.path!, at) : []),
    ...(await pathRevocation(input.pool, proven.path, at)),
  ];
  const missing: LongTermGap[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.status === 'good') continue;
    // A certificate on both paths is named once.
    const key = toHex(row.certificate);
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push({
      certificate: row.name,
      reason: row.status === 'revoked' ? 'revoked' : 'no-answer',
    });
  }
  if (missing.length > 0) return without(proven.genTime, missing);

  const last = lastOf([proven, ...covering])!;
  return {
    enabled: true,
    at: proven.genTime,
    until: certificateFromDer(last.authorityCertificate).notAfter.value.toISOString(),
    documentTimestamp,
    missing: [],
  };
}

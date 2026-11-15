import type {
  DigestAlgorithm,
  DocumentHandle,
  Signature,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';

import type { ParsedCms } from './cms/parse';
import type { CryptographyVerdict } from './cms/verify';
import { checkTimestampToken } from './cms/verify-timestamp';
import { EARLIEST, judge, judgeToken, longTermInputOf, NOW, read, type Reading } from './judgement';
import { longTermVerdict, type LongTermVerdict, type RevocationVerdict } from './long-term';
import { DEFAULT_MAX_CRL_BYTES, fillPool } from './revocation/fill';
import { readValidationPool, ValidationPool } from './revocation/pool';
import type { RevocationSource } from './revocation/source';
import type { AppliedValidationTime, TrustPort, TrustStatus, ValidationTime } from './trust';

export type IntegrityVerdict = 'valid' | 'invalid' | 'indeterminate';
export type ModificationsVerdict = 'unchanged' | 'permitted' | 'forbidden' | 'indeterminate';

/** What every timestamp verdict says, whatever its summary. */
export interface TimestampFacts {
  /** The token verifies, binds its authority's certificate, and stamps the bytes it belongs to. */
  readonly cryptography: CryptographyVerdict;
  /** The authority's certificate leads to one of your timestamp anchors and may issue timestamps. */
  readonly trust: TrustStatus;
  readonly trustReason: string | null;
  /** When the authority was judged: now, or at a later document timestamp (`earliest-timestamp`). */
  readonly validationTime: AppliedValidationTime;
  /**
   * Whether a certificate between the authority and your anchor was withdrawn by
   * `validationTime`, from the answers the file holds. `unknown` when the authority isn't
   * trusted, or when some certificate has no answer that speaks for that time.
   */
  readonly revocation: RevocationVerdict;
  /** Which certificate, and why, when `revocation` isn't `good`. */
  readonly revocationReason: string | null;
  /**
   * Who vouches for the time: the common name of the authority's certificate. `null` when the
   * certificate has none, or wasn't found.
   */
  readonly authorityName: string | null;
}

/**
 * What an RFC 3161 timestamp token is worth: a signature's timestamp, a document timestamp, or
 * a token over any digest. `valid` only when the token verifies and you trust its authority.
 * A token whose trusted authority was withdrawn by the time it is judged is `invalid`.
 */
export type TimestampVerdict = TimestampFacts &
  (
    | {
        readonly summary: 'valid' | 'valid-untrusted';
        /** What the token asserts: the bytes existed by this time (ISO 8601). The token's `genTime`. */
        readonly stampedAt: string;
        /** DER of the authority's certificate. */
        readonly authorityCertificate: Uint8Array;
      }
    | {
        readonly summary: 'invalid' | 'indeterminate';
        /** `null` when the token can't be read far enough to say. */
        readonly stampedAt: string | null;
        readonly authorityCertificate: Uint8Array | null;
      }
  );

/**
 * Four independent facts and a summary, never one boolean — the shape
 * Acrobat reports ("signature valid", "signer unknown", "document changed,
 * changes allowed") and the shape a UI can explain.
 */
export interface SignatureVerdict {
  signature: Signature;
  /** The sealed bytes are intact: whole-revision coverage and the CMS message digest matches them. */
  integrity: IntegrityVerdict;
  /** The CMS verifies with its own certificate. */
  cryptography: CryptographyVerdict;
  /** The certificate chains to one of the caller's anchors. */
  trust: TrustStatus;
  trustReason?: string;
  /** When the signer's certificate was judged: now, or at the time a timestamp proves (`stampedAt`). */
  validationTime: AppliedValidationTime;
  /**
   * Whether a certificate between the signer and your anchor was withdrawn by
   * `validationTime`, from the answers the file holds: its validation data, and what its
   * signatures carry. `revoked` only on proof, and then `summary` is `invalid`. `unknown` when
   * the signer isn't trusted, or when some certificate has no answer that speaks for that
   * time; it never changes `summary`.
   */
  revocation: RevocationVerdict;
  /** Which certificate, and why, when `revocation` isn't `good`. */
  revocationReason?: string;
  /**
   * What changed after the signature, and which bytes were judged: the loaded
   * file (`persisted`), or the session's unsaved edits snapshotted as one
   * more revision (`working-copy` — only when such edits existed).
   */
  modifications: {
    verdict: ModificationsVerdict;
    detail?: string;
    basis: 'persisted' | 'working-copy';
    /** Revisions appended after the one this signature sealed (present when there are any). */
    laterRevisions?: number;
    /** Some object was changed after the signature and holds the sealed value again. */
    undone?: boolean;
  };
  /** `invalid` only on positive evidence; `indeterminate` whenever a fact could not be established. */
  summary: 'valid' | 'valid-untrusted' | 'invalid' | 'indeterminate';
  cms: ParsedCms | null;
  /**
   * The signature's timestamp: for a signature, the token it carries (the earliest one that is
   * `valid` when it carries several), or `null` when it carries none; for a document timestamp,
   * the token it is. It never changes `summary`: a valid signature with a broken timestamp is
   * still valid.
   */
  timestamp: TimestampVerdict | null;
  /**
   * Whether the file holds everything to check this signature with no network. It always
   * speaks for the time a timestamp proves, whatever `validationTime` is.
   */
  longTerm: LongTermVerdict;
}

export interface ValidateSignaturesOptions {
  trust?: TrustPort | null;
  /**
   * When certificates are judged. By default, and with `{ kind: 'earliest-timestamp' }`, each
   * certificate is judged at the earliest trusted timestamp that covers what it signed: a
   * signer's at its signature's own timestamp or at a document timestamp added later, a
   * timestamp authority's at a document timestamp added later, and now when there is none.
   * That is the time a reader such as Acrobat judges at: a certificate that expired or was
   * withdrawn after it signed was still good when it signed. `{ kind: 'now' }` judges every
   * certificate as of now. Revocation is judged at the same time, from the answers the file
   * holds.
   */
  validationTime?: ValidationTime | { kind: 'earliest-timestamp' };
  /**
   * Where to ask for the answers the file lacks: whether a certificate was withdrawn, and the
   * certificate of an issuer a path is missing. They are used for this check and nothing is
   * stored. An address that does not answer leaves `revocation` as `unknown`. It is the only
   * way a certificate judged as of now gets an answer, and it tells each authority asked that
   * someone is checking that certificate. Needs `trust`.
   */
  revocation?: RevocationSource | null;
  /**
   * `persisted` (default): the loaded bytes — what a file on disk says.
   * `working-copy`: unsaved edits are judged too, as the revision a save would
   * write — what the file a save produces will say. A viewer shows this one.
   */
  until?: 'persisted' | 'working-copy';
}

/**
 * Validate every signature of a document: integrity from the engine's
 * bytes, cryptography from the CMS, trust from the caller's anchors, and
 * revocation from the answers the document holds.
 */
export async function validateSignatures(
  doc: DocumentHandle,
  options: ValidateSignaturesOptions = {},
): Promise<SignatureVerdict[]> {
  if (!doc.signatures) throw new Error('this engine does not implement signatures');
  const snapshot = await doc.signatures.list();
  const trust = options.trust ?? null;
  const pool = await readValidationPool(doc);
  const readings: Reading[] = [];
  for (const signature of snapshot.signatures) {
    if (signature.signed) readings.push(await read(doc, snapshot, signature, pool));
  }

  // Long-term validation always speaks for the times the timestamps prove, so that judgement
  // is made whatever was asked for. It is the answer too unless another time was asked for.
  const requested = options.validationTime ?? EARLIEST;
  if (options.revocation && trust) {
    await fillPool({
      readings,
      trust,
      pool,
      source: options.revocation,
      maxCrlBytes: DEFAULT_MAX_CRL_BYTES,
      times: requested.kind === 'earliest-timestamp' ? [EARLIEST] : [EARLIEST, requested],
    });
  }
  const atTimestamps = await judge(readings, trust, pool, EARLIEST);
  const judged =
    requested.kind === 'earliest-timestamp'
      ? atTimestamps
      : await judge(readings, trust, pool, requested);

  const verdicts: SignatureVerdict[] = [];
  for (const reading of readings) {
    const judgement = judged.judgements.get(reading)!;
    const proof = atTimestamps.judgements.get(reading)!;
    const modifications = await modificationsOf(
      doc,
      snapshot,
      reading.signature,
      options.until ?? 'persisted',
    );
    const revoked = judgement.trust === 'trusted' && judgement.revocation === 'revoked';
    let summary: SignatureVerdict['summary'];
    if (
      reading.integrity === 'invalid' ||
      reading.cryptography === 'invalid' ||
      modifications.verdict === 'forbidden'
    ) {
      summary = 'invalid';
    } else if (
      reading.integrity === 'indeterminate' ||
      reading.cryptography === 'unsupported' ||
      modifications.verdict === 'indeterminate'
    ) {
      summary = 'indeterminate';
    } else if (revoked) {
      // Proof that the certificate was withdrawn by the time it is judged at.
      summary = 'invalid';
    } else {
      summary = judgement.trust === 'trusted' ? 'valid' : 'valid-untrusted';
    }
    verdicts.push({
      signature: reading.signature,
      integrity: reading.integrity,
      cryptography: reading.cryptography,
      trust: judgement.trust,
      trustReason: judgement.trustReason,
      validationTime: judgement.validationTime,
      revocation: judgement.revocation,
      ...(judgement.revocationReason ? { revocationReason: judgement.revocationReason } : {}),
      modifications,
      summary,
      cms: reading.cms,
      timestamp: judgement.timestamp,
      longTerm: await longTermVerdict(
        // What the file holds: an answer that was only asked for is not in it.
        longTermInputOf(reading, proof, atTimestamps.documentTimestamps, pool, 'file'),
      ),
    });
  }
  return verdicts;
}

/**
 * Check an RFC 3161 timestamp token over any digest: the daily hash of an audit log as much as
 * a document's. A digest is its bytes and its algorithm: a token that stamps the same bytes
 * under another algorithm is `invalid`. Without `trust` the authority is `unknown`. The
 * authority is judged now: a token on its own has nothing after it to vouch for it.
 */
export async function verifyTimestampToken(input: {
  token: Uint8Array;
  digest: Uint8Array;
  algorithm: DigestAlgorithm;
  trust?: TrustPort | null;
}): Promise<TimestampVerdict> {
  const check = await checkTimestampToken({
    token: input.token,
    stamped: { kind: 'digest', digest: input.digest, algorithm: input.algorithm },
  });
  // A token on its own has no document: the only answers are the ones it carries itself.
  const pool = new ValidationPool();
  if (check.token) pool.addCarried(check.token.certificates, check.token.revocation);
  return (await judgeToken(check, input.trust ?? null, NOW, pool)).verdict;
}

/**
 * What changed after the signature, from the engine's revision analysis:
 * the current document judged against the revision the signature sealed
 * (net state; a certification also replays every intervening revision).
 * A signature that seals the last revision is `unchanged` without analysis.
 */
async function modificationsOf(
  doc: DocumentHandle,
  snapshot: SignatureSnapshot,
  signature: Signature,
  until: 'persisted' | 'working-copy',
): Promise<SignatureVerdict['modifications']> {
  if (signature.revisionIndex === null) {
    return {
      verdict: 'indeterminate',
      detail: 'the signature seals no whole revision',
      basis: 'persisted',
    };
  }
  // "Nothing after it" is only knowable from the loaded bytes when unsaved
  // edits are not part of the question.
  if (until === 'persisted' && signature.revisionIndex === snapshot.revisions.length - 1) {
    return { verdict: 'unchanged', basis: 'persisted' };
  }
  try {
    // The analysis reports its own basis: `persisted` when there were no
    // unsaved edits to include, even when the working copy was asked for.
    const analysis = await doc.signatures.analyze({
      since: { signatureIndex: signature.index },
      until,
    });
    // The explanation comes from the verdict that counts, never from a step
    // the final state has since undone.
    const primary = analysis.current.primary;
    const detail =
      primary && primary.verdict === 'forbidden'
        ? `object ${primary.objectNumber}, ${primary.rule}${primary.detail ? `: ${primary.detail}` : ''}`
        : primary && primary.verdict === 'incomplete'
          ? `object ${primary.objectNumber}: ${primary.detail ?? 'incomplete evidence'}`
          : undefined;
    return {
      verdict: analysis.current.verdict,
      detail,
      basis: analysis.basis.source,
      ...(analysis.later.revisionCount > 0 ? { laterRevisions: analysis.later.revisionCount } : {}),
      ...(analysis.later.undoneObjectNumbers.length > 0 ? { undone: true } : {}),
    };
  } catch (error) {
    return {
      verdict: 'indeterminate',
      detail: `analysis failed: ${(error as Error).message}`,
      basis: 'persisted',
    };
  }
}

import type {
  DigestAlgorithm,
  DocumentHandle,
  Signature,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import type * as pkijs from 'pkijs';

import { bytesEqual } from './cms/engine';
import { CmsError, parseCmsInternal, type ParsedCms, type ParsedCmsInternal } from './cms/parse';
import { verifyCmsSignature, type CryptographyVerdict } from './cms/verify';
import { checkTimestampToken, signatureValueOf, type TimestampCheck } from './cms/verify-timestamp';
import { certificateCommonName } from './signers/self-signed';
import {
  validateChain,
  validateTimestampAuthority,
  type TrustPort,
  type TrustStatus,
  type ValidationTime,
} from './trust';

export type IntegrityVerdict = 'valid' | 'invalid' | 'indeterminate';
export type ModificationsVerdict = 'unchanged' | 'permitted' | 'forbidden' | 'indeterminate';

interface TimestampFacts {
  /** The token verifies, binds its authority's certificate, and stamps the bytes it belongs to. */
  readonly cryptography: CryptographyVerdict;
  /** The authority's certificate leads to one of your timestamp anchors and may issue timestamps. */
  readonly trust: TrustStatus;
  readonly trustReason: string | null;
  /** When the authority was judged: now, or at a later document timestamp (`earliest-timestamp`). */
  readonly validationTime: ValidationTime;
  /**
   * Who vouches for the time: the common name of the authority's certificate. `null` when the
   * certificate has none, or wasn't found.
   */
  readonly authorityName: string | null;
}

/**
 * What an RFC 3161 timestamp token is worth: a signature's timestamp, a document timestamp, or
 * a token over any digest. `valid` only when the token verifies and you trust its authority.
 */
export type TimestampVerdict = TimestampFacts &
  (
    | {
        readonly summary: 'valid' | 'valid-untrusted';
        /** What the token asserts: the bytes existed by this time (ISO 8601). */
        readonly genTime: string;
        /** DER of the authority's certificate. */
        readonly authorityCertificate: Uint8Array;
      }
    | {
        readonly summary: 'invalid' | 'indeterminate';
        /** `null` when the token can't be read far enough to say. */
        readonly genTime: string | null;
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
  validationTime: ValidationTime;
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
}

export interface ValidateSignaturesOptions {
  trust?: TrustPort | null;
  /**
   * When certificates are judged: now by default. `{ kind: 'earliest-timestamp' }` judges each
   * certificate at the earliest trusted timestamp that covers what it signed: a signer's at its
   * signature's own timestamp or at a document timestamp added later, a timestamp authority's at
   * a document timestamp added later, and now when there is none. It looks at dates only: no
   * revocation is checked.
   */
  validationTime?: ValidationTime | { kind: 'earliest-timestamp' };
  /**
   * `persisted` (default): the loaded bytes — what a file on disk says.
   * `working-copy`: unsaved edits are judged too, as the revision a save would
   * write — what the file a save produces will say. A viewer shows this one.
   */
  until?: 'persisted' | 'working-copy';
}

const NOW: ValidationTime = { kind: 'now' };

/**
 * Validate every signature of a document: integrity from the engine's
 * bytes, cryptography from the CMS, trust from the caller's anchors.
 */
export async function validateSignatures(
  doc: DocumentHandle,
  options: ValidateSignaturesOptions = {},
): Promise<SignatureVerdict[]> {
  if (!doc.signatures) throw new Error('this engine does not implement signatures');
  const snapshot = await doc.signatures.list();
  const trust = options.trust ?? null;
  const readings: Reading[] = [];
  for (const signature of snapshot.signatures) {
    if (signature.signed) readings.push(await read(doc, snapshot, signature));
  }

  const requested = options.validationTime ?? NOW;
  const earliest = requested.kind === 'earliest-timestamp';
  /** The document timestamps trusted so far, with the revision each one sealed. */
  const proven: { revisionIndex: number; genTime: string }[] = [];
  /** The earliest trusted document timestamp added after `revisionIndex`. */
  const coveredAt = (revisionIndex: number | null): ValidationTime | null => {
    if (!earliest || revisionIndex === null) return null;
    const later = proven.filter((stamp) => stamp.revisionIndex > revisionIndex);
    if (later.length === 0) return null;
    return timestampTime(later.map((stamp) => stamp.genTime).sort()[0]!);
  };

  // Document timestamps first, from the last one back: a later one vouches for an earlier one's
  // authority, and the last has nothing after it.
  const judged = new Map<Reading, Judgement>();
  const documentTimestamps = readings
    .filter((reading) => reading.kind === 'timestamp')
    .sort((a, b) => (b.signature.revisionIndex ?? -1) - (a.signature.revisionIndex ?? -1));
  for (const reading of documentTimestamps) {
    const at = coveredAt(reading.signature.revisionIndex) ?? NOW;
    const timestamp = reading.token ? await timestampVerdict(reading.token, trust, at) : null;
    judged.set(reading, {
      trust: timestamp?.trust ?? 'unknown',
      trustReason: timestamp?.trustReason ?? undefined,
      validationTime: at,
      timestamp,
    });
    const revisionIndex = reading.signature.revisionIndex;
    if (timestamp?.summary === 'valid' && reading.integrity === 'valid' && revisionIndex !== null) {
      proven.push({ revisionIndex, genTime: timestamp.genTime });
    }
  }

  for (const reading of readings) {
    if (reading.kind === 'timestamp') continue;
    const covered = coveredAt(reading.signature.revisionIndex);
    const timestamps: TimestampVerdict[] = [];
    for (const token of reading.tokens) {
      timestamps.push(
        await timestampVerdict(token, trust, covered ?? NOW, reading.internal?.certificates),
      );
    }
    const timestamp = earliestValid(timestamps) ?? timestamps[0] ?? null;
    const at = earliest
      ? earlierOf(timestamp?.summary === 'valid' ? timestampTime(timestamp.genTime) : null, covered)
      : (requested as ValidationTime);
    const chain = reading.internal
      ? await validateChain(reading.internal, trust, at)
      : { status: 'unknown' as const, reason: undefined };
    judged.set(reading, {
      trust: chain.status,
      trustReason: chain.reason,
      validationTime: at,
      timestamp,
    });
  }

  const verdicts: SignatureVerdict[] = [];
  for (const reading of readings) {
    const judgement = judged.get(reading)!;
    const modifications = await modificationsOf(
      doc,
      snapshot,
      reading.signature,
      options.until ?? 'persisted',
    );
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
      modifications,
      summary,
      cms: reading.cms,
      timestamp: judgement.timestamp,
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
  return timestampVerdict(check, input.trust ?? null, NOW);
}

/** What one signature says before any certificate is judged: the facts time doesn't change. */
interface Reading {
  signature: Signature;
  kind: Signature['kind'];
  integrity: IntegrityVerdict;
  cryptography: CryptographyVerdict;
  /** A signature's CMS; null for a document timestamp and for a CMS that can't be read. */
  internal: ParsedCmsInternal | null;
  cms: ParsedCms | null;
  /** A signature's timestamp tokens, each checked against its signature value. */
  tokens: TimestampCheck[];
  /** A document timestamp's own token, checked against the bytes it seals; null when its bytes couldn't be had. */
  token: TimestampCheck | null;
}

/** What judging a signature's certificates adds to its reading. */
interface Judgement {
  trust: TrustStatus;
  trustReason: string | undefined;
  validationTime: ValidationTime;
  timestamp: TimestampVerdict | null;
}

async function read(
  doc: DocumentHandle,
  snapshot: SignatureSnapshot,
  signature: Signature,
): Promise<Reading> {
  const reading: Reading = {
    signature,
    kind: signature.kind,
    integrity: 'indeterminate',
    cryptography: 'unsupported',
    internal: null,
    cms: null,
    tokens: [],
    token: null,
  };
  if (!snapshot.chainValid || signature.coverage === 'malformed') {
    reading.integrity = snapshot.chainValid ? 'invalid' : 'indeterminate';
    return reading;
  }
  return signature.kind === 'timestamp'
    ? readDocumentTimestamp(doc, signature, reading)
    : readSignature(doc, signature, reading);
}

async function readSignature(
  doc: DocumentHandle,
  signature: Signature,
  reading: Reading,
): Promise<Reading> {
  let internal: ParsedCmsInternal;
  try {
    const contents = await doc.signatures.getContents(signature.field);
    internal = parseCmsInternal(contents);
    reading.cms = internal.parsed;
    const digest = await doc.signatures.getDigest(signature.field, internal.digestAlgorithm);
    const digestMatches = bytesEqual(digest, internal.messageDigest);
    reading.integrity =
      signature.coverage === 'whole-revision' && digestMatches ? 'valid' : 'invalid';
  } catch (error) {
    // A CMS this engine cannot read is not evidence of tampering.
    reading.integrity =
      error instanceof CmsError && error.reason === 'unsupported' ? 'indeterminate' : 'invalid';
    if (!(error instanceof CmsError)) reading.integrity = 'indeterminate';
    return reading;
  }
  reading.internal = internal;
  reading.cryptography = await verifyCmsSignature(internal);
  const signatureValue = signatureValueOf(internal.signerInfo);
  for (const token of internal.timestampTokens) {
    reading.tokens.push(
      await checkTimestampToken({
        token,
        stamped: { kind: 'bytes', bytes: signatureValue },
        certificates: internal.certificates,
      }),
    );
  }
  return reading;
}

/**
 * A document timestamp is its token: `integrity` is whether the token stamps the bytes it
 * seals, `cryptography` whether the token itself is sound.
 */
async function readDocumentTimestamp(
  doc: DocumentHandle,
  signature: Signature,
  reading: Reading,
): Promise<Reading> {
  let contents: Uint8Array;
  try {
    contents = await doc.signatures.getContents(signature.field);
  } catch {
    return reading;
  }
  const check = await checkTimestampToken({
    token: contents,
    stamped: {
      kind: 'digest-with',
      digest: (algorithm) => doc.signatures.getDigest(signature.field, algorithm),
    },
  }).catch((): TimestampCheck | null => null);
  // The engine couldn't hash the sealed bytes: nothing is known about the token either way.
  if (!check) return reading;
  reading.token = check;
  reading.cms = check.token?.parsed ?? null;
  if (check.problem === 'unreadable') return reading;
  const stampsTheseBytes = check.problem !== 'imprint';
  reading.integrity =
    signature.coverage === 'whole-revision' && stampsTheseBytes ? 'valid' : 'invalid';
  // A token over other bytes may be sound in itself: judge it against the digest it does stamp.
  reading.cryptography = stampsTheseBytes
    ? check.verdict
    : (
        await checkTimestampToken({
          token: contents,
          stamped: {
            kind: 'digest',
            digest: check.info!.imprint,
            algorithm: check.info!.imprintAlgorithm,
          },
        })
      ).verdict;
  return reading;
}

/** A checked token, with its authority judged at `at`. */
async function timestampVerdict(
  check: TimestampCheck,
  trust: TrustPort | null,
  at: ValidationTime,
  certificates?: pkijs.Certificate[],
): Promise<TimestampVerdict> {
  const genTime = check.info ? check.info.genTime.toISOString() : null;
  const authorityCertificate = check.token ? check.token.parsed.signerCertificate : null;
  let status: TrustStatus = 'unknown';
  let reason: string | null = check.detail;
  if (check.token && check.info) {
    const authority = await validateTimestampAuthority({
      token: check.token,
      certificates,
      trust,
      at,
      genTime: check.info.genTime,
    });
    status = authority.status;
    reason = authority.reason ?? null;
  }
  const facts: TimestampFacts = {
    cryptography: check.verdict,
    trust: status,
    trustReason: reason,
    validationTime: at,
    authorityName: authorityCertificate ? certificateCommonName(authorityCertificate) : null,
  };
  if (check.verdict === 'valid' && genTime !== null && authorityCertificate !== null) {
    return {
      ...facts,
      summary: status === 'trusted' ? 'valid' : 'valid-untrusted',
      genTime,
      authorityCertificate,
    };
  }
  return {
    ...facts,
    summary: check.verdict === 'invalid' ? 'invalid' : 'indeterminate',
    genTime,
    authorityCertificate,
  };
}

function timestampTime(genTime: string): ValidationTime {
  return { kind: 'timestamp', genTime, tokenVerified: true };
}

/** The earliest of the timestamps whose summary is `valid`, or null when none is. */
function earliestValid(timestamps: TimestampVerdict[]): TimestampVerdict | null {
  let earliest: (TimestampVerdict & { summary: 'valid' }) | null = null;
  for (const timestamp of timestamps) {
    if (timestamp.summary !== 'valid') continue;
    if (!earliest || timestamp.genTime < earliest.genTime) {
      earliest = timestamp as TimestampVerdict & { summary: 'valid' };
    }
  }
  return earliest;
}

/** The earlier of two proven times, or now when neither is proven. */
function earlierOf(left: ValidationTime | null, right: ValidationTime | null): ValidationTime {
  const times = [left, right].filter(
    (time): time is Extract<ValidationTime, { kind: 'timestamp' }> => time?.kind === 'timestamp',
  );
  if (times.length === 0) return NOW;
  return times.sort((a, b) => (a.genTime < b.genTime ? -1 : 1))[0]!;
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

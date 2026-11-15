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
import {
  longTermVerdict,
  type LongTermVerdict,
  type ProvenDocumentTimestamp,
  type ProvenTime,
  type RevocationVerdict,
} from './long-term';
import {
  pathRevocation,
  readValidationPool,
  summarizeRevocation,
  ValidationPool,
} from './revocation/pool';
import { certificateCommonName } from './signers/self-signed';
import {
  timeOf,
  validateChainAmong,
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
   * `persisted` (default): the loaded bytes — what a file on disk says.
   * `working-copy`: unsaved edits are judged too, as the revision a save would
   * write — what the file a save produces will say. A viewer shows this one.
   */
  until?: 'persisted' | 'working-copy';
}

const NOW: ValidationTime = { kind: 'now' };

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
      longTerm: await longTermVerdict({
        kind: reading.kind,
        revisionIndex: reading.signature.revisionIndex,
        subject: reading.cms ? certificateCommonName(reading.cms.signerCertificate) : null,
        reliesOn: proof.reliesOn,
        withoutTime: proof.withoutTime,
        signer: { trusted: proof.trust === 'trusted', path: proof.path },
        documentTimestamps: atTimestamps.documentTimestamps,
        pool,
      }),
    });
  }
  return verdicts;
}

const EARLIEST = { kind: 'earliest-timestamp' } as const;

/** Every reading judged, and the document timestamps that turned out to prove a time. */
interface Judged {
  judgements: Map<Reading, Judgement>;
  documentTimestamps: ProvenDocumentTimestamp[];
}

/**
 * Judge the certificates behind every reading at `requested`: each timestamp's authority, then
 * each signer. Under `earliest-timestamp` a certificate is judged at the earliest trusted
 * timestamp that covers what it signed.
 */
async function judge(
  readings: readonly Reading[],
  trust: TrustPort | null,
  pool: ValidationPool,
  requested: ValidationTime | typeof EARLIEST,
): Promise<Judged> {
  const earliest = requested.kind === 'earliest-timestamp';
  /** The document timestamps trusted so far, with the revision each one sealed. */
  const proven: ProvenDocumentTimestamp[] = [];
  /** The earliest trusted document timestamp added after `revisionIndex`. */
  const coveredBy = (revisionIndex: number | null): ProvenDocumentTimestamp | null => {
    if (!earliest || revisionIndex === null) return null;
    return proven
      .filter((stamp) => stamp.revisionIndex > revisionIndex)
      .reduce<ProvenDocumentTimestamp | null>(
        (first, stamp) => (!first || stamp.genTime < first.genTime ? stamp : first),
        null,
      );
  };

  // Document timestamps first, from the last one back: a later one vouches for an earlier one's
  // authority, and the last has nothing after it.
  const judgements = new Map<Reading, Judgement>();
  const documentTimestamps = readings
    .filter((reading) => reading.kind === 'timestamp')
    .sort((a, b) => (b.signature.revisionIndex ?? -1) - (a.signature.revisionIndex ?? -1));
  for (const reading of documentTimestamps) {
    const covered = coveredBy(reading.signature.revisionIndex);
    const at = covered ? timestampTime(covered.genTime) : NOW;
    const token = reading.token ? await judgeToken(reading.token, trust, at, pool) : null;
    const timestamp = token?.verdict ?? null;
    const revisionIndex = reading.signature.revisionIndex;
    const time = token && reading.integrity === 'valid' ? provenTimeOf(token) : null;
    if (time && revisionIndex !== null) proven.push({ ...time, revisionIndex });
    judgements.set(reading, {
      trust: timestamp?.trust ?? 'unknown',
      trustReason: timestamp?.trustReason ?? undefined,
      validationTime: at,
      path: token?.path ?? null,
      revocation: timestamp?.revocation ?? 'unknown',
      revocationReason: timestamp?.revocationReason ?? undefined,
      timestamp,
      reliesOn: time,
      // A sound token over these bytes whose authority isn't trusted proves no time to you.
      withoutTime:
        timestamp && reading.integrity === 'valid' && timestamp.cryptography === 'valid'
          ? 'untrusted'
          : 'no-timestamp',
    });
  }

  for (const reading of readings) {
    if (reading.kind === 'timestamp') continue;
    const covered = coveredBy(reading.signature.revisionIndex);
    const tokens: JudgedToken[] = [];
    for (const check of reading.tokens) {
      tokens.push(
        await judgeToken(
          check,
          trust,
          covered ? timestampTime(covered.genTime) : NOW,
          pool,
          reading.internal?.certificates,
        ),
      );
    }
    const own = earliestValid(tokens);
    const timestamp = (own ?? tokens[0])?.verdict ?? null;
    // The earlier of the signature's own timestamp and a document timestamp added after it.
    const ownTime = own ? provenTimeOf(own) : null;
    const reliesOn = earliest
      ? ownTime && covered
        ? ownTime.genTime <= covered.genTime
          ? ownTime
          : covered
        : (ownTime ?? covered)
      : null;
    const at = earliest
      ? reliesOn
        ? timestampTime(reliesOn.genTime)
        : NOW
      : (requested as ValidationTime);
    const chain = reading.internal
      ? await validateChainAmong(reading.internal, trust, at, pool.certificates)
      : { status: 'unknown' as const, reason: undefined, path: undefined };
    const revocation =
      chain.status === 'trusted' && chain.path
        ? summarizeRevocation(await pathRevocation(pool, chain.path, timeOf(at)), nameOf(at))
        : { status: 'unknown' as const, reason: NO_ISSUER };
    judgements.set(reading, {
      trust: chain.status,
      trustReason: chain.reason,
      validationTime: at,
      path: chain.status === 'trusted' ? (chain.path ?? null) : null,
      revocation: revocation.status,
      revocationReason: revocation.reason ?? undefined,
      timestamp,
      reliesOn,
      withoutTime: 'no-timestamp',
    });
  }
  return { judgements, documentTimestamps: proven };
}

const NO_ISSUER = 'the signer is not trusted, so there is no issuer to check an answer against';

/** A validation time in words, for a reason: "now", or the time a timestamp proves. */
function nameOf(at: ValidationTime): string {
  return at.kind === 'now' ? 'now' : at.genTime;
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
  /** The validated path, anchor last, when trusted: a signer's, or a document timestamp's authority's. */
  path: Uint8Array[] | null;
  revocation: RevocationVerdict;
  revocationReason: string | undefined;
  timestamp: TimestampVerdict | null;
  /** The timestamp that proves the time the signature is judged at; null when none does. */
  reliesOn: ProvenTime | null;
  /** Why no timestamp proves a time, when none does. */
  withoutTime: 'no-timestamp' | 'untrusted';
}

/** A timestamp token judged, with its authority's validated path when the authority is trusted. */
interface JudgedToken {
  verdict: TimestampVerdict;
  path: Uint8Array[] | null;
}

/** The time a judged token proves, when it is `valid`: it verifies and its authority is trusted. */
function provenTimeOf(token: JudgedToken): ProvenTime | null {
  const { verdict, path } = token;
  if (verdict.summary !== 'valid' || !path) return null;
  return { genTime: verdict.genTime, path, authorityCertificate: verdict.authorityCertificate };
}

/** Read one signature, and offer what its CMS carries to `pool`. */
async function read(
  doc: DocumentHandle,
  snapshot: SignatureSnapshot,
  signature: Signature,
  pool: ValidationPool,
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
  const read =
    signature.kind === 'timestamp'
      ? await readDocumentTimestamp(doc, signature, reading)
      : await readSignature(doc, signature, reading);
  if (read.internal) pool.addCarried(read.internal.certificates, read.internal.revocation);
  for (const check of [...read.tokens, ...(read.token ? [read.token] : [])]) {
    if (check.token) pool.addCarried(check.token.certificates, check.token.revocation);
  }
  return read;
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

/** A checked token, with its authority judged at `at`: its trust, and whether it was withdrawn. */
async function judgeToken(
  check: TimestampCheck,
  trust: TrustPort | null,
  at: ValidationTime,
  pool: ValidationPool,
  certificates: pkijs.Certificate[] = [],
): Promise<JudgedToken> {
  const genTime = check.info ? check.info.genTime.toISOString() : null;
  const authorityCertificate = check.token ? check.token.parsed.signerCertificate : null;
  let status: TrustStatus = 'unknown';
  let reason: string | null = check.detail;
  let path: Uint8Array[] | null = null;
  if (check.token && check.info) {
    const authority = await validateTimestampAuthority({
      token: check.token,
      certificates: [...certificates, ...pool.certificates],
      trust,
      at,
      genTime: check.info.genTime,
    });
    status = authority.status;
    reason = authority.reason ?? null;
    path = authority.status === 'trusted' ? (authority.path ?? null) : null;
  }
  const revocation = path
    ? summarizeRevocation(await pathRevocation(pool, path, timeOf(at)), nameOf(at))
    : {
        status: 'unknown' as const,
        reason: 'the authority is not trusted, so there is no issuer to check an answer against',
      };
  const facts: TimestampFacts = {
    cryptography: check.verdict,
    trust: status,
    trustReason: reason,
    validationTime: at,
    revocation: revocation.status,
    revocationReason: revocation.reason,
    authorityName: authorityCertificate ? certificateCommonName(authorityCertificate) : null,
  };
  // Proof that the authority's certificate was withdrawn by the time it is judged at.
  const revoked = status === 'trusted' && revocation.status === 'revoked';
  if (check.verdict === 'valid' && !revoked && genTime !== null && authorityCertificate !== null) {
    return {
      verdict: {
        ...facts,
        summary: status === 'trusted' ? 'valid' : 'valid-untrusted',
        genTime,
        authorityCertificate,
      },
      path,
    };
  }
  return {
    verdict: {
      ...facts,
      summary: check.verdict === 'invalid' || revoked ? 'invalid' : 'indeterminate',
      genTime,
      authorityCertificate,
    },
    path,
  };
}

function timestampTime(genTime: string): ValidationTime {
  return { kind: 'timestamp', genTime, tokenVerified: true };
}

/** The earliest of the tokens whose verdict is `valid`, or null when none is. */
function earliestValid(tokens: readonly JudgedToken[]): JudgedToken | null {
  let earliest: JudgedToken | null = null;
  for (const token of tokens) {
    if (token.verdict.summary !== 'valid') continue;
    if (!earliest || token.verdict.genTime < earliest.verdict.genTime!) earliest = token;
  }
  return earliest;
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

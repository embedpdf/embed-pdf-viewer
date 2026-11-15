/**
 * Reading a document's signatures and judging the certificates behind them: what
 * `validateSignatures()` reports and what collecting validation data works from. A reading is
 * what a signature says before any certificate is judged; a judgement is its trust and its
 * revocation at a time.
 */
import type { DocumentHandle, Signature, SignatureSnapshot } from '@embedpdf/engine-core/runtime';
import type * as pkijs from 'pkijs';

import { bytesEqual } from './cms/engine';
import { CmsError, parseCmsInternal, type ParsedCms, type ParsedCmsInternal } from './cms/parse';
import { verifyCmsSignature, type CryptographyVerdict } from './cms/verify';
import { checkTimestampToken, signatureValueOf, type TimestampCheck } from './cms/verify-timestamp';
import type {
  LongTermInput,
  ProvenDocumentTimestamp,
  ProvenTime,
  RevocationVerdict,
} from './long-term';
import { pathRevocation, summarizeRevocation, type ValidationPool } from './revocation/pool';
import { certificateCommonName } from './signers/self-signed';
import {
  appliedValidationTime,
  timeOf,
  validateChainAmong,
  validateTimestampAuthority,
  type AppliedValidationTime,
  type TrustPort,
  type TrustStatus,
  type ValidationTime,
} from './trust';
import type { IntegrityVerdict, TimestampFacts, TimestampVerdict } from './verdict';

export const NOW: AppliedValidationTime = { kind: 'now' };

export const EARLIEST = { kind: 'earliest-timestamp' } as const;

/** Every reading judged, and the document timestamps that turned out to prove a time. */
export interface Judged {
  judgements: Map<Reading, Judgement>;
  documentTimestamps: ProvenDocumentTimestamp[];
}

/**
 * Judge the certificates behind every reading at `requested`: each timestamp's authority, then
 * each signer. Under `earliest-timestamp` a certificate is judged at the earliest trusted
 * timestamp that covers what it signed.
 */
export async function judge(
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
      timestampPath: null,
      withoutIssuer: token?.withoutIssuer ? [token.withoutIssuer] : [],
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
      : appliedValidationTime(requested as ValidationTime);
    const chain = reading.internal
      ? await validateChainAmong(reading.internal, trust, at, pool.certificates)
      : {
          status: 'unknown' as const,
          reason: undefined,
          path: undefined,
          withoutIssuer: undefined,
        };
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
      timestampPath: (own ?? tokens[0])?.path ?? null,
      withoutIssuer: [
        ...(chain.withoutIssuer ? [chain.withoutIssuer] : []),
        ...tokens.flatMap((token) => (token.withoutIssuer ? [token.withoutIssuer] : [])),
      ],
    });
  }
  return { judgements, documentTimestamps: proven };
}

const NO_ISSUER = 'the signer is not trusted, so there is no issuer to check an answer against';

/**
 * What long-term validation is worked out from, for one reading: its judgement at the
 * timestamps (`earliest-timestamp`), and the document timestamps that judgement found trusted.
 */
export function longTermInputOf(
  reading: Reading,
  atTimestamps: Judgement,
  documentTimestamps: readonly ProvenDocumentTimestamp[],
  pool: ValidationPool,
  answersFrom: LongTermInput['answersFrom'],
): LongTermInput {
  return {
    kind: reading.kind,
    revisionIndex: reading.signature.revisionIndex,
    subject: reading.cms ? certificateCommonName(reading.cms.signerCertificate) : null,
    reliesOn: atTimestamps.reliesOn,
    withoutTime: atTimestamps.withoutTime,
    signer: { trusted: atTimestamps.trust === 'trusted', path: atTimestamps.path },
    documentTimestamps,
    pool,
    answersFrom,
  };
}

/** A validation time in words, for a reason: "now", or the time a timestamp proves. */
function nameOf(at: AppliedValidationTime): string {
  return at.kind === 'now' ? 'now' : at.stampedAt;
}

/** What one signature says before any certificate is judged: the facts time doesn't change. */
export interface Reading {
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
export interface Judgement {
  trust: TrustStatus;
  trustReason: string | undefined;
  validationTime: AppliedValidationTime;
  /** The validated path, anchor last, when trusted: a signer's, or a document timestamp's authority's. */
  path: Uint8Array[] | null;
  revocation: RevocationVerdict;
  revocationReason: string | undefined;
  timestamp: TimestampVerdict | null;
  /** The timestamp that proves the time the signature is judged at; null when none does. */
  reliesOn: ProvenTime | null;
  /** Why no timestamp proves a time, when none does. */
  withoutTime: 'no-timestamp' | 'untrusted';
  /** The path of the authority of a signature's own `timestamp`, when that authority is trusted. */
  timestampPath: Uint8Array[] | null;
  /**
   * DER of each certificate whose issuer was not found, which is why a path is not trusted:
   * the signer's, or a timestamp authority's.
   */
  withoutIssuer: Uint8Array[];
}

/** A timestamp token judged, with its authority's validated path when the authority is trusted. */
export interface JudgedToken {
  verdict: TimestampVerdict;
  path: Uint8Array[] | null;
  /** DER of the certificate whose issuer was not found, when that is why the authority isn't trusted. */
  withoutIssuer: Uint8Array | null;
}

/** The time a judged token proves, when it is `valid`: it verifies and its authority is trusted. */
function provenTimeOf(token: JudgedToken): ProvenTime | null {
  const { verdict, path } = token;
  if (verdict.summary !== 'valid' || !path) return null;
  return { genTime: verdict.stampedAt, path, authorityCertificate: verdict.authorityCertificate };
}

/** Read one signature, and offer what its CMS carries to `pool`. */
export async function read(
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
export async function judgeToken(
  check: TimestampCheck,
  trust: TrustPort | null,
  at: AppliedValidationTime,
  pool: ValidationPool,
  certificates: pkijs.Certificate[] = [],
): Promise<JudgedToken> {
  const genTime = check.info ? check.info.genTime.toISOString() : null;
  const authorityCertificate = check.token ? check.token.parsed.signerCertificate : null;
  let status: TrustStatus = 'unknown';
  let reason: string | null = check.detail;
  let path: Uint8Array[] | null = null;
  let withoutIssuer: Uint8Array | null = null;
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
    withoutIssuer = authority.withoutIssuer ?? null;
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
        stampedAt: genTime,
        authorityCertificate,
      },
      path,
      withoutIssuer,
    };
  }
  return {
    verdict: {
      ...facts,
      summary: check.verdict === 'invalid' || revoked ? 'invalid' : 'indeterminate',
      stampedAt: genTime,
      authorityCertificate,
    },
    path,
    withoutIssuer,
  };
}

function timestampTime(stampedAt: string): AppliedValidationTime {
  return { kind: 'timestamp', stampedAt, genTime: stampedAt, tokenVerified: true };
}

/** The earliest of the tokens whose verdict is `valid`, or null when none is. */
function earliestValid(tokens: readonly JudgedToken[]): JudgedToken | null {
  let earliest: JudgedToken | null = null;
  for (const token of tokens) {
    if (token.verdict.summary !== 'valid') continue;
    if (!earliest || token.verdict.stampedAt < earliest.verdict.stampedAt!) earliest = token;
  }
  return earliest;
}

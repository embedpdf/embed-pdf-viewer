/**
 * Asking certificate authorities for what a file lacks: an answer for every certificate that
 * has none at the time it is judged at, and the certificate of an issuer a path is missing.
 * Collecting validation data and checking a signature online both come here.
 */
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { toArrayBuffer, toHex } from '../cms/engine';
import { certificateFromDer } from '../cms/parse';
import { judge, type EARLIEST, type Judgement, type Reading } from '../judgement';
import { timeOf, type TrustPort, type ValidationTime } from '../trust';
import { revocationAddresses } from './addresses';
import { checkRevocationAnswer } from './answer';
import { pathRevocation, type CertificateRevocation, type ValidationPool } from './pool';
import { buildOcspRequest } from './request';
import type { RevocationRequest, RevocationSource } from './source';

/** The largest list of withdrawn certificates that is stored, unless `maxCrlBytes` says otherwise. */
export const DEFAULT_MAX_CRL_BYTES = 1024 * 1024;

/**
 * How many times the paths are judged again after something new was learned. Each round
 * brings at most one more issuer per path, and paths are a few certificates long.
 */
const MAX_ROUNDS = 8;

/** Why a certificate still has no answer after asking. */
export interface AskingProblem {
  /** What happened, in words. */
  detail: string;
  /** The error of an address that did not answer, when that is what happened. */
  network: EngineError | null;
}

/**
 * Ask `source` for what the pool lacks, until nothing new comes: an answer for every
 * certificate that has none at the time it is judged at, and the certificate of an issuer a
 * path is missing. Every answer is checked before it joins the pool, and a fetched
 * certificate is only ever a candidate for a path. Without a source nothing is asked.
 *
 * It never throws for an address that did not answer: what could not be had comes back, by
 * the DER of the certificate (as hex), for the caller to report or to leave as `unknown`.
 */
export async function fillPool(input: {
  readings: readonly Reading[];
  /** The readings to work for; every one when left out. */
  wanted?: (reading: Reading) => boolean;
  trust: TrustPort | null;
  pool: ValidationPool;
  source: RevocationSource | null;
  maxCrlBytes: number;
  /** The times to judge at. Long-term validation is asked about under `earliest-timestamp`. */
  times: readonly (ValidationTime | typeof EARLIEST)[];
}): Promise<Map<string, AskingProblem>> {
  const { readings, trust, pool, source, maxCrlBytes } = input;
  const problems = new Map<string, AskingProblem>();
  if (!trust) return problems;
  const asked = new Set<string>();
  const issuersAsked = new Set<string>();

  /** Fetch from `source`; a failure is noted and null comes back. */
  const fetch = async (
    request: RevocationRequest,
    note: (problem: AskingProblem) => void,
  ): Promise<Uint8Array | null> => {
    try {
      return await source!.fetch(request);
    } catch (error) {
      const network = EngineError.is(error, EngineErrorCode.Network);
      note({
        detail: (error as Error).message,
        // No answer came. Whoever reports it needs the address that was asked.
        network: network
          ? new EngineError(EngineErrorCode.Network, error.message, {
              details: { ...(error.details as object), source: request.url },
              cause: error,
            })
          : EngineError.is(error)
            ? null
            : new EngineError(
                EngineErrorCode.Network,
                `${request.url} did not answer: ${(error as Error).message}`,
                { details: { source: request.url }, cause: error },
              ),
      });
      return null;
    }
  };

  /** Ask about one certificate: OCSP first, then its issuer's list. True when an answer joined the pool. */
  const askAbout = async (row: CertificateRevocation): Promise<boolean> => {
    const key = toHex(row.certificate);
    if (asked.has(key)) return false;
    asked.add(key);
    if (!source) {
      problems.set(key, { detail: 'no `revocation` source was given to ask with', network: null });
      return false;
    }
    const certificate = certificateFromDer(row.certificate);
    const issuer = certificateFromDer(row.issuer);
    const addresses = revocationAddresses(certificate);
    let problem: AskingProblem | null = null;
    const note = (next: AskingProblem) => {
      // The first address that did not answer is the one to report; otherwise the last word.
      if (!problem?.network) problem = next;
    };
    const tries: RevocationRequest[] = [];
    for (const url of addresses.ocsp) {
      tries.push({ kind: 'ocsp', url, body: await buildOcspRequest(certificate, issuer) });
    }
    for (const url of addresses.crl) tries.push({ kind: 'crl', url });
    if (tries.length === 0) {
      problems.set(key, { detail: 'the certificate names no address to ask at', network: null });
      return false;
    }
    for (const request of tries) {
      const der = await fetch(request, note);
      if (!der) continue;
      if (request.kind === 'crl' && der.byteLength > maxCrlBytes) {
        note({
          detail: `the list at ${request.url} is ${der.byteLength} bytes, over maxCrlBytes (${maxCrlBytes})`,
          network: null,
        });
        continue;
      }
      const kind = request.kind === 'ocsp' ? 'ocsp' : 'crl';
      const check = await checkRevocationAnswer({ answer: { kind, der }, certificate, issuer });
      if (check.says === 'nothing') {
        note({
          detail: `the answer from ${request.url} says nothing: ${check.detail}`,
          network: null,
        });
        continue;
      }
      pool.addAnswer(kind, der, false);
      problems.delete(key);
      return true;
    }
    if (problem) problems.set(key, problem);
    return false;
  };

  /** Fetch the certificate that issued `orphan`, from the address it names. True when one joined the pool. */
  const fetchIssuerOf = async (orphan: Uint8Array): Promise<boolean> => {
    const key = toHex(orphan);
    if (issuersAsked.has(key) || !source) return false;
    issuersAsked.add(key);
    const known = pool.certificates.length;
    for (const url of revocationAddresses(certificateFromDer(orphan)).issuer) {
      const der = await fetch({ kind: 'issuer', url }, () => {});
      if (!der) continue;
      for (const certificate of certificatesIn(der)) pool.addCertificate(certificate, false);
      if (pool.certificates.length > known) return true;
    }
    return false;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let learned = false;
    for (const time of input.times) {
      const judged = await judge(readings, trust, pool, time);
      for (const reading of readings) {
        if (input.wanted && !input.wanted(reading)) continue;
        const judgement = judged.judgements.get(reading)!;
        for (const orphan of judgement.withoutIssuer) {
          if (await fetchIssuerOf(orphan)) learned = true;
        }
        const rows = await rowsToAnswer(
          reading,
          judgement,
          pool,
          time.kind === 'earliest-timestamp',
        );
        for (const row of rows) {
          if (row.status === 'unknown' && (await askAbout(row))) learned = true;
        }
      }
    }
    if (!learned) break;
  }
  return problems;
}

/**
 * The certificates a judgement asks about, each at the time it is judged at: the signer's
 * path, the path of its timestamp's authority, and for long-term validation the path of the
 * timestamp that proves the time, at that time.
 */
async function rowsToAnswer(
  reading: Reading,
  judgement: Judgement,
  pool: ValidationPool,
  longTerm: boolean,
): Promise<CertificateRevocation[]> {
  const rows: CertificateRevocation[] = [];
  if (judgement.path) {
    rows.push(...(await pathRevocation(pool, judgement.path, timeOf(judgement.validationTime))));
  }
  if (reading.kind === 'signature' && judgement.timestampPath && judgement.timestamp) {
    rows.push(
      ...(await pathRevocation(
        pool,
        judgement.timestampPath,
        timeOf(judgement.timestamp.validationTime),
      )),
    );
  }
  if (longTerm && judgement.reliesOn) {
    const proven = judgement.reliesOn;
    rows.push(...(await pathRevocation(pool, proven.path, new Date(proven.genTime))));
  }
  return rows;
}

/** The certificates in what an issuer's address serves: one certificate, or a PKCS #7 bundle of them. */
function certificatesIn(der: Uint8Array): pkijs.Certificate[] {
  try {
    return [certificateFromDer(der)];
  } catch {
    // Not one certificate: some authorities serve a bundle.
  }
  try {
    const parsed = asn1js.fromBER(toArrayBuffer(der));
    if (parsed.offset === -1) return [];
    const content = new pkijs.ContentInfo({ schema: parsed.result });
    const signedData = new pkijs.SignedData({ schema: content.content });
    return (signedData.certificates ?? []).filter(
      (entry): entry is pkijs.Certificate => entry instanceof pkijs.Certificate,
    );
  } catch {
    return [];
  }
}

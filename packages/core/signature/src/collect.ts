/**
 * Collecting validation data: asking certificate authorities for the answers a file lacks, and
 * keeping them in the file. What is asked for is exactly what a reader asks about (see
 * `long-term.ts`), and every answer goes through the one checker before it counts, so what is
 * stored is what a reader will accept.
 */
import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type FormFieldRef,
  type ValidationInfo,
  type ValidationInfoCounts,
} from '@embedpdf/engine-core/runtime';

import { toHex } from './cms/engine';
import { EARLIEST, judge, longTermInputOf, read, type Reading } from './judgement';
import { longTermFindings, type LongTermFindings } from './long-term';
import { DEFAULT_MAX_CRL_BYTES, fillPool, type AskingProblem } from './revocation/fill';
import { readValidationPool } from './revocation/pool';
import type { RevocationSource } from './revocation/source';
import type { TrustPort } from './trust';
import { validateSignatures, type SignatureVerdict } from './verdict';

export interface AddValidationInfoOptions {
  /** The certificates you trust, as for `validateSignatures()`: you preserve what you would accept. */
  trust: TrustPort;
  /** Where the answers come from. Without one, only `known` and what the file holds are used. */
  revocation?: RevocationSource | null;
  /** Answers and certificates you already have, each in DER. They are checked like any other. */
  known?: Partial<ValidationInfo>;
  /** The signature fields to cover. Default: every signature and document timestamp. */
  fields?: readonly FormFieldRef[];
  /**
   * Store what there is when something is missing, and don't fail for it. `verdicts` then says
   * what each signature lacks. Default false: all or nothing.
   */
  partial?: boolean;
  /** The largest list of withdrawn certificates to store, in bytes. Default 1 MiB. */
  maxCrlBytes?: number;
}

export interface AddValidationInfoResult {
  /** How many entries of each kind were stored. */
  added: ValidationInfoCounts;
  /** What `validateSignatures()` says about the result, each signature judged at its timestamp. */
  verdicts: SignatureVerdict[];
}

/**
 * Keep a document's signatures checkable with no network: ask for the answers the file lacks,
 * check each one, and store them with the certificates a reader needs to follow the same
 * paths. For every signature and document timestamp it works out which certificates can be
 * withdrawn (the signer's path and the timestamp authority's, below the ones you trust), takes
 * the answers the file already holds, then `known`, then asks `revocation` at the addresses
 * the certificates name: OCSP first, then the issuer's list.
 *
 * All or nothing: when a signature would not read as complete, nothing is stored and it
 * throws. `Network`, with the address in `details.source`, when an address did not answer;
 * `SignatureRefused` otherwise, with `details.reason` (`'no-timestamp'`, `'untrusted'`,
 * `'no-answer'` or `'revoked'`), `details.certificate` and `details.field`. `partial: true`
 * stores what there is instead.
 *
 * It fails as `doc.signatures.addValidationInfo()` fails, before anything is asked: with
 * `ProtectedDocument` after a certification that allows no changes.
 */
export async function addValidationInfo(
  doc: DocumentHandle,
  options: AddValidationInfoOptions,
): Promise<AddValidationInfoResult> {
  if (!doc.signatures) throw new Error('this engine does not implement signatures');
  if (!options?.trust) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'addValidationInfo() needs `trust`: the answers kept are the ones for paths you trust',
      { details: { field: 'trust' } },
    );
  }
  const { trust } = options;
  // The engine's own refusals come first, before any authority is asked.
  await doc.signatures.addValidationInfo({});

  const snapshot = await doc.signatures.list();
  const pool = await readValidationPool(doc);
  const readings: Reading[] = [];
  for (const signature of snapshot.signatures) {
    if (signature.signed) readings.push(await read(doc, snapshot, signature, pool));
  }
  const wanted = wantedAmong(readings, options.fields);
  for (const der of options.known?.certificates ?? []) pool.addCertificate(der, false);
  for (const der of options.known?.ocspResponses ?? []) pool.addAnswer('ocsp', der, false);
  for (const der of options.known?.crls ?? []) pool.addAnswer('crl', der, false);

  const problems = await fillPool({
    readings,
    wanted: (reading) => wanted.has(reading),
    trust,
    pool,
    source: options.revocation ?? null,
    maxCrlBytes: options.maxCrlBytes ?? DEFAULT_MAX_CRL_BYTES,
    times: [EARLIEST],
  });

  // What a reader would find now, and what it needs in the file to find it again.
  const judged = await judge(readings, trust, pool, EARLIEST);
  const store = {
    certificates: new Map<string, Uint8Array>(),
    ocspResponses: new Map<string, Uint8Array>(),
    crls: new Map<string, Uint8Array>(),
  };
  const keep = (list: Map<string, Uint8Array>, der: Uint8Array) => list.set(toHex(der), der);
  for (const reading of readings) {
    if (!wanted.has(reading)) continue;
    const judgement = judged.judgements.get(reading)!;
    const findings = await longTermFindings(
      // With what is about to be stored: what a reader will find afterwards.
      longTermInputOf(reading, judgement, judged.documentTimestamps, pool, 'anywhere'),
    );
    if (!findings.verdict.enabled && !options.partial) {
      throw failureOf(reading, findings, problems);
    }
    for (const path of [judgement.path, judgement.reliesOn?.path]) {
      for (const der of path ?? []) keep(store.certificates, der);
    }
    for (const row of findings.rows) {
      if (row.evidence && !row.evidence.inFile) {
        keep(row.evidence.kind === 'ocsp' ? store.ocspResponses : store.crls, row.evidence.der);
      }
      // A responder that answered in the issuer's place: a reader checks the answer with it.
      if (row.answer && row.answer.says !== 'nothing' && row.answer.responder) {
        keep(store.certificates, row.answer.responder);
      }
    }
  }
  let added: ValidationInfoCounts = { certificates: 0, ocspResponses: 0, crls: 0 };
  if (store.certificates.size + store.ocspResponses.size + store.crls.size > 0) {
    const stored = await doc.signatures.addValidationInfo({
      certificates: [...store.certificates.values()],
      ocspResponses: [...store.ocspResponses.values()],
      crls: [...store.crls.values()],
    });
    added = stored.added;
  }

  // Read the result the way a reader would: success means the file reads complete.
  const verdicts = await validateSignatures(doc, { trust });
  if (!options.partial) {
    for (const reading of readings) {
      if (!wanted.has(reading)) continue;
      const verdict = verdicts.find((entry) => entry.signature.index === reading.signature.index);
      if (!verdict?.longTerm.enabled) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `the validation data was stored, and the signature in "${reading.signature.fieldName}" still does not read as complete`,
          { details: { field: reading.signature.fieldName, missing: verdict?.longTerm.missing } },
        );
      }
    }
  }
  return { added, verdicts };
}

/** The readings `fields` names; every one when it names none. A field with no signature is `NotFound`. */
function wantedAmong(
  readings: readonly Reading[],
  fields: readonly FormFieldRef[] | undefined,
): Set<Reading> {
  if (!fields) return new Set(readings);
  const wanted = new Set<Reading>();
  for (const field of fields) {
    const reading = readings.find(({ signature }) =>
      field.kind === 'fqn'
        ? signature.fieldName === field.name
        : signature.field.kind === 'objectNumber' &&
          signature.field.objectNumber === field.objectNumber,
    );
    if (!reading) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no signature in field ${field.kind === 'fqn' ? `"${field.name}"` : `object ${field.objectNumber}`}`,
        { details: { field: 'fields' } },
      );
    }
    wanted.add(reading);
  }
  return wanted;
}

/** The error for a signature that would not read as complete: the first thing in its way. */
function failureOf(
  reading: Reading,
  findings: LongTermFindings,
  problems: ReadonlyMap<string, AskingProblem>,
): EngineError {
  const gap = findings.gaps[0]!;
  const field = reading.signature.fieldName;
  const problem = gap.der ? problems.get(toHex(gap.der)) : undefined;
  if (gap.reason === 'no-answer' && problem?.network) return problem.network;
  const named = gap.certificate ? `"${gap.certificate}"` : 'a certificate';
  const why: Record<typeof gap.reason, string> = {
    'no-timestamp': `the signature in "${field}" has no timestamp you trust, so no time is proven to judge its certificates at`,
    untrusted: `${named} does not lead to a certificate in \`trust\``,
    revoked: `${named} was withdrawn by the time of the signature's timestamp`,
    'no-answer': `no answer that checks out says ${named} was good at the signature's timestamp${
      problem ? `: ${problem.detail}` : ''
    }`,
  };
  return new EngineError(
    EngineErrorCode.SignatureRefused,
    `validation data not added: ${why[gap.reason]}`,
    { details: { reason: gap.reason, certificate: gap.certificate, field } },
  );
}

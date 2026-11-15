/**
 * The one verifier of revocation answers: an OCSP response or a CRL, asked about one
 * certificate. Collecting answers and reading them both come here, so what is stored is what a
 * reader will accept. It is offline and deterministic, and says nothing about time: whether an
 * answer speaks for the moment a certificate is judged at is `revocationStatusAt`.
 */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { bytesEqual, ensureEngine, toArrayBuffer } from '../cms/engine';
import { OID } from '../cms/oids';
import { certDer } from '../cms/parse';

/** A revocation answer as it is stored and sent: DER, and which of the two kinds it is. */
export interface RevocationAnswer {
  kind: 'ocsp' | 'crl';
  der: Uint8Array;
}

/**
 * Why an answer says nothing about a certificate. Every one of these means the answer is set
 * aside; none of them is evidence that the certificate is good or that it was withdrawn.
 *
 * - `unreadable`: it doesn't parse as an OCSP response or a CRL;
 * - `not-successful`: the responder answered with an error instead of a status;
 * - `other-certificate`: it is about another certificate, or from another issuer;
 * - `unknown-status`: the responder says it doesn't know the certificate;
 * - `wrong-signer`: it was signed by someone the certificate's issuer did not let answer;
 * - `signature`: its signature doesn't verify;
 * - `unsupported`: it uses an algorithm or a critical extension unknown here;
 * - `indirect-crl`: the list is published by someone other than the certificate's issuer;
 * - `delta-crl`: the list holds only the changes since another list;
 * - `out-of-scope`: the list leaves out the kind of certificate asked about, or some reasons.
 */
export type RevocationProblem =
  | 'unreadable'
  | 'not-successful'
  | 'other-certificate'
  | 'unknown-status'
  | 'wrong-signer'
  | 'signature'
  | 'unsupported'
  | 'indirect-crl'
  | 'delta-crl'
  | 'out-of-scope';

/** Why a certificate was withdrawn, as its issuer gave it (RFC 5280 §5.3.1). */
export type RevocationReason =
  | 'unspecified'
  | 'key-compromise'
  | 'ca-compromise'
  | 'affiliation-changed'
  | 'superseded'
  | 'cessation-of-operation'
  | 'certificate-hold'
  | 'remove-from-crl'
  | 'privilege-withdrawn'
  | 'aa-compromise';

const REASONS: Record<number, RevocationReason> = {
  0: 'unspecified',
  1: 'key-compromise',
  2: 'ca-compromise',
  3: 'affiliation-changed',
  4: 'superseded',
  5: 'cessation-of-operation',
  6: 'certificate-hold',
  8: 'remove-from-crl',
  9: 'privilege-withdrawn',
  10: 'aa-compromise',
};

/** The time an answer speaks for: from `thisUpdate`, to `nextUpdate` when it names one. */
interface AnswerWindow {
  kind: 'ocsp' | 'crl';
  thisUpdate: Date;
  nextUpdate: Date | null;
  /**
   * DER of the certificate that signed an OCSP answer in the issuer's place, when one did: a
   * reader needs it to check the answer again. Null for a CRL and for an issuer's own answer.
   */
  responder: Uint8Array | null;
}

/** What one answer says about one certificate. */
export type RevocationAnswerCheck =
  | ({ says: 'good' } & AnswerWindow)
  | ({ says: 'revoked'; revokedAt: Date; reason: RevocationReason | null } & AnswerWindow)
  | { says: 'nothing'; kind: 'ocsp' | 'crl'; problem: RevocationProblem; detail: string };

/**
 * Check a revocation answer about `certificate`, which `issuer` issued. The answer must be
 * about that certificate, signed by the issuer or by a responder the issuer certified for
 * answering, and its signature must verify. What it then says comes back with the time it
 * speaks for.
 */
export async function checkRevocationAnswer(input: {
  answer: RevocationAnswer;
  certificate: pkijs.Certificate;
  issuer: pkijs.Certificate;
}): Promise<RevocationAnswerCheck> {
  ensureEngine();
  const { answer, certificate, issuer } = input;
  const nothing = (problem: RevocationProblem, detail: string): RevocationAnswerCheck => ({
    says: 'nothing',
    kind: answer.kind,
    problem,
    detail,
  });
  if (!certificate.issuer.isEqual(issuer.subject)) {
    return nothing('other-certificate', 'the certificate was not issued by the issuer given');
  }
  try {
    return answer.kind === 'ocsp'
      ? await checkOcsp(answer.der, certificate, issuer, nothing)
      : await checkCrl(answer.der, certificate, issuer, nothing);
  } catch (error) {
    return nothing('unreadable', (error as Error).message);
  }
}

type Nothing = (problem: RevocationProblem, detail: string) => RevocationAnswerCheck;

const OCSP_ERRORS: Record<number, string> = {
  1: 'malformed request',
  2: 'internal error',
  3: 'try later',
  5: 'a signed request is required',
  6: 'unauthorized',
};

async function checkOcsp(
  der: Uint8Array,
  certificate: pkijs.Certificate,
  issuer: pkijs.Certificate,
  nothing: Nothing,
): Promise<RevocationAnswerCheck> {
  const engine = ensureEngine();
  const outer = asn1js.fromBER(toArrayBuffer(der));
  if (outer.offset === -1) return nothing('unreadable', 'the OCSP response is not valid DER');
  const response = new pkijs.OCSPResponse({ schema: outer.result });
  const status = response.responseStatus.valueBlock.valueDec;
  if (status !== 0) {
    return nothing(
      'not-successful',
      `the responder answered "${OCSP_ERRORS[status] ?? `status ${status}`}"`,
    );
  }
  const bytes = response.responseBytes;
  if (!bytes) return nothing('unreadable', 'the OCSP response carries no answer');
  if (bytes.responseType !== OID.ocspBasic) {
    return nothing('unsupported', `OCSP response type ${bytes.responseType}`);
  }
  const inner = asn1js.fromBER(bytes.response.valueBlock.valueHexView);
  if (inner.offset === -1) return nothing('unreadable', 'the OCSP answer is not valid DER');
  const basic = new pkijs.BasicOCSPResponse({ schema: inner.result });
  const data = basic.tbsResponseData;

  // The answer about this certificate: the one whose identifier is the certificate's, made
  // with the hash the identifier names.
  let single: pkijs.SingleResponse | null = null;
  let unknownHash: string | null = null;
  for (const candidate of data.responses) {
    const algorithm = engine.getAlgorithmByOID(candidate.certID.hashAlgorithm.algorithmId, false);
    if (!('name' in algorithm) || typeof algorithm.name !== 'string') {
      unknownHash = candidate.certID.hashAlgorithm.algorithmId;
      continue;
    }
    const expected = new pkijs.CertID();
    await expected.createForCertificate(certificate, {
      hashAlgorithm: algorithm.name,
      issuerCertificate: issuer,
    });
    if (candidate.certID.isEqual(expected)) {
      single = candidate;
      break;
    }
  }
  if (!single) {
    return unknownHash
      ? nothing('unsupported', `the answer identifies its certificate with hash ${unknownHash}`)
      : nothing('other-certificate', 'the OCSP response is about another certificate');
  }

  // Who signed: the issuer itself, or a responder the issuer certified for answering.
  const signer = await findResponder(data.responderID, [issuer, ...(basic.certs ?? [])]);
  if (!signer) {
    return nothing('wrong-signer', "the responder's certificate is not in the response");
  }
  const own = sameCertificate(signer, issuer);
  if (!own) {
    const problem = await delegationProblem(signer, issuer, data.producedAt);
    if (problem) return nothing('wrong-signer', problem);
  }
  const signature = await verifies(
    data.tbsView,
    basic.signature,
    signer.subjectPublicKeyInfo,
    basic.signatureAlgorithm,
  );
  if (signature === 'unsupported') {
    return nothing(
      'unsupported',
      `signature algorithm ${basic.signatureAlgorithm.algorithmId} of the OCSP response`,
    );
  }
  if (signature === 'invalid') {
    return nothing('signature', "the OCSP response's signature does not verify");
  }

  const window: AnswerWindow = {
    kind: 'ocsp',
    thisUpdate: single.thisUpdate,
    nextUpdate: single.nextUpdate ?? null,
    responder: own ? null : certDer(signer),
  };
  const state = single.certStatus as asn1js.BaseBlock;
  switch (state.idBlock.tagNumber) {
    case 0:
      return { says: 'good', ...window };
    case 1: {
      const [time, reason] = (state as asn1js.Constructed).valueBlock.value;
      if (!(time instanceof asn1js.GeneralizedTime)) {
        return nothing('unreadable', 'the OCSP response names no revocation time');
      }
      const code = (
        (reason as asn1js.Constructed | undefined)?.valueBlock.value[0] as
          | asn1js.Enumerated
          | undefined
      )?.valueBlock.valueDec;
      return {
        says: 'revoked',
        revokedAt: time.toDate(),
        reason: code === undefined ? null : (REASONS[code] ?? null),
        ...window,
      };
    }
    default:
      return nothing('unknown-status', 'the responder does not know the certificate');
  }
}

/** The certificate a responder identifier names: by its subject, or by the SHA-1 of its key. */
async function findResponder(
  id: unknown,
  candidates: pkijs.Certificate[],
): Promise<pkijs.Certificate | null> {
  const engine = ensureEngine();
  for (const candidate of candidates) {
    if (id instanceof pkijs.RelativeDistinguishedNames) {
      if (candidate.subject.isEqual(id)) return candidate;
    } else if (id instanceof asn1js.OctetString) {
      const key = candidate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
      const hash = new Uint8Array(await engine.digest('SHA-1', toArrayBuffer(key)));
      if (bytesEqual(hash, new Uint8Array(id.valueBlock.valueHexView))) return candidate;
    }
  }
  return null;
}

function sameCertificate(left: pkijs.Certificate, right: pkijs.Certificate): boolean {
  return bytesEqual(certDer(left), certDer(right));
}

/**
 * Why a certificate may not answer in the issuer's place, or null when it may: the issuer
 * issued it, for answering, and it was within its dates when it answered (RFC 6960 §4.2.2.2).
 */
async function delegationProblem(
  responder: pkijs.Certificate,
  issuer: pkijs.Certificate,
  producedAt: Date,
): Promise<string | null> {
  if (!responder.issuer.isEqual(issuer.subject)) {
    return "the responder's certificate was not issued by the certificate's issuer";
  }
  let issued = false;
  try {
    issued = await responder.verify(issuer);
  } catch {
    issued = false;
  }
  if (!issued) return "the responder's certificate is not signed by the certificate's issuer";
  const usage = responder.extensions?.find(
    (extension) => extension.extnID === OID.extendedKeyUsage,
  );
  const purposes = (usage?.parsedValue as pkijs.ExtKeyUsage | undefined)?.keyPurposes ?? [];
  if (!purposes.includes(OID.ocspSigning)) {
    return "the responder's certificate is not made for answering about certificates";
  }
  if (producedAt < responder.notBefore.value || producedAt > responder.notAfter.value) {
    return "the responder's certificate was outside its dates when it answered";
  }
  return null;
}

async function checkCrl(
  der: Uint8Array,
  certificate: pkijs.Certificate,
  issuer: pkijs.Certificate,
  nothing: Nothing,
): Promise<RevocationAnswerCheck> {
  const asn1 = asn1js.fromBER(toArrayBuffer(der));
  if (asn1.offset === -1) return nothing('unreadable', 'the CRL is not valid DER');
  const crl = new pkijs.CertificateRevocationList({ schema: asn1.result });
  if (!crl.issuer.isEqual(issuer.subject)) {
    return nothing('other-certificate', "the CRL is not from the certificate's issuer");
  }

  for (const extension of crl.crlExtensions?.extensions ?? []) {
    if (extension.extnID === OID.deltaCrlIndicator) {
      return nothing('delta-crl', 'the CRL lists only what changed since another list');
    }
    if (extension.extnID === OID.issuingDistributionPoint) {
      const scope = extension.parsedValue as pkijs.IssuingDistributionPoint | undefined;
      if (!scope) return nothing('unreadable', "the CRL's scope cannot be read");
      if (scope.indirectCRL) {
        return nothing('indirect-crl', 'the CRL lists certificates of other issuers');
      }
      const authority = isAuthority(certificate);
      if (
        scope.onlyContainsAttributeCerts ||
        (scope.onlyContainsUserCerts && authority) ||
        (scope.onlyContainsCACerts && !authority) ||
        scope.onlySomeReasons !== undefined
      ) {
        return nothing('out-of-scope', 'the CRL does not cover this kind of certificate');
      }
    } else if (extension.critical && !KNOWN_CRL_EXTENSIONS.has(extension.extnID)) {
      return nothing('unsupported', `critical CRL extension ${extension.extnID}`);
    }
  }

  if (!maySignCrls(issuer)) {
    return nothing('wrong-signer', "the issuer's certificate is not made for signing CRLs");
  }
  const signature = await verifies(
    crl.tbsView,
    crl.signatureValue,
    issuer.subjectPublicKeyInfo,
    crl.signatureAlgorithm,
  );
  if (signature === 'unsupported') {
    return nothing('unsupported', `signature algorithm ${crl.signatureAlgorithm.algorithmId}`);
  }
  if (signature === 'invalid') return nothing('signature', "the CRL's signature does not verify");

  const window: AnswerWindow = {
    kind: 'crl',
    thisUpdate: crl.thisUpdate.value,
    nextUpdate: crl.nextUpdate?.value ?? null,
    responder: null,
  };
  const serial = integerBytes(certificate.serialNumber);
  const entry = (crl.revokedCertificates ?? []).find((candidate) =>
    bytesEqual(integerBytes(candidate.userCertificate), serial),
  );
  if (!entry) return { says: 'good', ...window };
  const reason = entry.crlEntryExtensions?.extensions.find(
    (extension) => extension.extnID === OID.crlReason,
  );
  const code = (reason?.parsedValue as asn1js.Enumerated | undefined)?.valueBlock.valueDec;
  return {
    says: 'revoked',
    revokedAt: entry.revocationDate.value,
    reason: code === undefined ? null : (REASONS[code] ?? null),
    ...window,
  };
}

/** CRL extensions that change nothing about what a full list from the issuer says. */
const KNOWN_CRL_EXTENSIONS: ReadonlySet<string> = new Set([
  OID.crlNumber,
  OID.authorityKeyIdentifier,
  OID.authorityInfoAccess,
  OID.freshestCrl,
]);

function isAuthority(certificate: pkijs.Certificate): boolean {
  const constraints = certificate.extensions?.find(
    (extension) => extension.extnID === OID.basicConstraints,
  );
  return (constraints?.parsedValue as pkijs.BasicConstraints | undefined)?.cA === true;
}

/** A certificate that names its key's uses must name CRL signing among them (RFC 5280 §4.2.1.3). */
function maySignCrls(issuer: pkijs.Certificate): boolean {
  const usage = issuer.extensions?.find((extension) => extension.extnID === OID.keyUsage);
  if (!usage) return true;
  const bits = (usage.parsedValue as asn1js.BitString | undefined)?.valueBlock.valueHexView;
  // cRLSign is the seventh bit, counted from the first.
  return bits !== undefined && bits.length > 0 && (bits[0]! & 0x02) !== 0;
}

/** An integer's bytes without the leading zero a positive number may carry. */
function integerBytes(integer: asn1js.Integer): Uint8Array {
  const bytes = new Uint8Array(integer.valueBlock.valueHexView);
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  return bytes.subarray(start);
}

async function verifies(
  signed: Uint8Array,
  signature: asn1js.BitString,
  key: pkijs.PublicKeyInfo,
  algorithm: pkijs.AlgorithmIdentifier,
): Promise<'valid' | 'invalid' | 'unsupported'> {
  try {
    const ok = await ensureEngine().verifyWithPublicKey(
      toArrayBuffer(signed),
      signature,
      key,
      algorithm,
    );
    return ok ? 'valid' : 'invalid';
  } catch (error) {
    const message = (error as Error).message ?? '';
    return /unsupported|unknown|not supported|not implemented|incorrect/i.test(message)
      ? 'unsupported'
      : 'invalid';
  }
}

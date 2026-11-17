/**
 * A throwaway certificate authority for tests and demos: it issues signers, answers whether
 * they were withdrawn, and can withdraw them. Everything lives in memory and nothing touches
 * the network, so a signing flow with long-term validation can be tried end to end without a
 * real authority. Never use it for a real document.
 */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { bytesEqual, ensureEngine, randomPositiveInteger, toArrayBuffer } from '../cms/engine';
import { OID } from '../cms/oids';
import { x509Time } from '../cms/time';
import type { RevocationReason } from '../revocation/answer';
import type { RevocationRequest, RevocationSource } from '../revocation/source';
import { generateSigningKeyPair, webCryptoSigner, type TestSigner } from './webcrypto';

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

/** A certificate with the key that signs for it. */
export interface Issuer {
  certificate: pkijs.Certificate;
  privateKey: CryptoKey;
}

/**
 * How a certificate says it can't be withdrawn: `'validity-assured'` is ETSI's "validity
 * assured, short term" extension (its standard 319 412-1), `'no-rev-avail'` is `noRevAvail`
 * (RFC 9608).
 */
export type Unrevocable = 'validity-assured' | 'no-rev-avail';

const REASON_CODES: Record<RevocationReason, number> = {
  unspecified: 0,
  'key-compromise': 1,
  'ca-compromise': 2,
  'affiliation-changed': 3,
  superseded: 4,
  'cessation-of-operation': 5,
  'certificate-hold': 6,
  'remove-from-crl': 8,
  'privilege-withdrawn': 9,
  'aa-compromise': 10,
};

/** A key usage extension: the named bits, counted from the first (RFC 5280 §4.2.1.3). */
function keyUsage(...bits: number[]): pkijs.Extension {
  let byte = 0;
  for (const bit of bits) byte |= 0x80 >> bit;
  const unusedBits = 7 - Math.max(...bits);
  return new pkijs.Extension({
    extnID: OID.keyUsage,
    critical: true,
    extnValue: new asn1js.BitString({
      valueHex: new Uint8Array([byte]).buffer,
      unusedBits,
    }).toBER(false),
  });
}

const DIGITAL_SIGNATURE = 0;
const NON_REPUDIATION = 1;
const KEY_CERT_SIGN = 5;
const CRL_SIGN = 6;

/**
 * Issue a certificate. `kind` sets what it is for:
 *
 * - `authority`: issues certificates and signs CRLs; self-signed without an `issuer`;
 * - `signer`: signs documents, and names where to ask about itself (`addresses`);
 * - `responder`: answers OCSP questions in its issuer's place, and is not asked about itself.
 */
export async function issueCertificate(input: {
  kind: 'authority' | 'signer' | 'responder';
  commonName: string;
  publicKey: CryptoKey;
  /** Who issues it. Without one the certificate signs itself, with `privateKey`. */
  issuer?: Issuer;
  privateKey?: CryptoKey;
  addresses?: { ocsp?: string; crl?: string; issuer?: string };
  /** The extension by which the certificate says it can't be withdrawn (`cannotBeRevoked`). */
  unrevocable?: Unrevocable;
  notBefore?: Date;
  notAfter?: Date;
}): Promise<pkijs.Certificate> {
  ensureEngine();
  const certificate = new pkijs.Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({
    valueHex: toArrayBuffer(randomPositiveInteger()),
  });
  certificate.subject.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({
      type: OID.commonName,
      value: new asn1js.Utf8String({ value: input.commonName }),
    }),
  );
  certificate.issuer = input.issuer ? input.issuer.certificate.subject : certificate.subject;
  certificate.notBefore = x509Time(input.notBefore ?? new Date(Date.now() - DAY));
  certificate.notAfter = x509Time(input.notAfter ?? new Date(Date.now() + 365 * DAY));

  const authority = input.kind === 'authority';
  const constraints = new pkijs.BasicConstraints({ cA: authority });
  certificate.extensions = [
    new pkijs.Extension({
      extnID: OID.basicConstraints,
      critical: true,
      extnValue: constraints.toSchema().toBER(false),
      parsedValue: constraints,
    }),
    authority
      ? keyUsage(DIGITAL_SIGNATURE, KEY_CERT_SIGN, CRL_SIGN)
      : input.kind === 'signer'
        ? keyUsage(DIGITAL_SIGNATURE, NON_REPUDIATION)
        : keyUsage(DIGITAL_SIGNATURE),
  ];
  if (input.kind === 'responder') {
    const purposes = new pkijs.ExtKeyUsage({ keyPurposes: [OID.ocspSigning] });
    certificate.extensions.push(
      new pkijs.Extension({
        extnID: OID.extendedKeyUsage,
        critical: false,
        extnValue: purposes.toSchema().toBER(false),
        parsedValue: purposes,
      }),
      new pkijs.Extension({
        extnID: OID.ocspNoCheck,
        critical: false,
        extnValue: new asn1js.Null().toBER(false),
      }),
    );
  }
  if (input.unrevocable) {
    certificate.extensions.push(
      new pkijs.Extension({
        extnID:
          input.unrevocable === 'no-rev-avail' ? OID.noRevAvail : OID.validityAssuredShortTerm,
        critical: false,
        extnValue: new asn1js.Null().toBER(false),
      }),
    );
  }
  const { ocsp, crl, issuer } = input.addresses ?? {};
  if (ocsp || issuer) {
    const uri = (value: string) => new pkijs.GeneralName({ type: 6, value });
    const access = new pkijs.InfoAccess({
      accessDescriptions: [
        ...(ocsp
          ? [
              new pkijs.AccessDescription({
                accessMethod: OID.accessOcsp,
                accessLocation: uri(ocsp),
              }),
            ]
          : []),
        ...(issuer
          ? [
              new pkijs.AccessDescription({
                accessMethod: OID.accessIssuers,
                accessLocation: uri(issuer),
              }),
            ]
          : []),
      ],
    });
    certificate.extensions.push(
      new pkijs.Extension({
        extnID: OID.authorityInfoAccess,
        critical: false,
        extnValue: access.toSchema().toBER(false),
        parsedValue: access,
      }),
    );
  }
  if (crl) {
    const points = new pkijs.CRLDistributionPoints({
      distributionPoints: [
        new pkijs.DistributionPoint({
          distributionPoint: [new pkijs.GeneralName({ type: 6, value: crl })],
        }),
      ],
    });
    certificate.extensions.push(
      new pkijs.Extension({
        extnID: OID.crlDistributionPoints,
        critical: false,
        extnValue: points.toSchema().toBER(false),
        parsedValue: points,
      }),
    );
  }
  await certificate.subjectPublicKeyInfo.importKey(input.publicKey);
  const signingKey = input.issuer?.privateKey ?? input.privateKey;
  if (!signingKey) throw new Error('a self-signed certificate needs its own private key');
  await certificate.sign(signingKey, 'SHA-256');
  // Read it back, so it is the certificate a reader parses: extensions decoded, bytes fixed.
  return pkijs.Certificate.fromBER(certificate.toSchema(true).toBER(false));
}

/** What an OCSP answer says about a certificate. */
export type AnswerStatus =
  | 'good'
  | 'unknown'
  | { revokedAt: Date; reason?: RevocationReason | null };

/**
 * Build an OCSP response about `certificate` (RFC 6960 §4.2). `signer` is the issuer itself or
 * a responder it certified; a responder's certificate goes into the response, as a reader
 * needs it to check the signature.
 */
export async function buildOcspResponse(input: {
  certificate: pkijs.Certificate;
  issuer: pkijs.Certificate;
  signer: Issuer;
  status: AnswerStatus;
  producedAt: Date;
  thisUpdate: Date;
  nextUpdate?: Date | null;
  /** How the response names its signer. Default: by name. */
  responderId?: 'name' | 'key';
  /** The hash the certificate is identified with. Default: SHA-1, as the request's. */
  idHash?: 'SHA-1' | 'SHA-256';
  /**
   * The identifier as a request carried it. A responder answers with the identifier it was
   * asked with, also for a certificate it does not know; given, it replaces the one made from
   * `certificate`.
   */
  asked?: pkijs.CertID;
}): Promise<Uint8Array> {
  const engine = ensureEngine();
  let certID = input.asked;
  if (!certID) {
    certID = new pkijs.CertID();
    await certID.createForCertificate(input.certificate, {
      hashAlgorithm: input.idHash ?? 'SHA-1',
      issuerCertificate: input.issuer,
    });
  }
  const context = (tagNumber: number) => ({ tagClass: 3, tagNumber });
  const certStatus =
    input.status === 'good'
      ? new asn1js.Primitive({ idBlock: context(0) })
      : input.status === 'unknown'
        ? new asn1js.Primitive({ idBlock: context(2) })
        : new asn1js.Constructed({
            idBlock: context(1),
            value: [
              new asn1js.GeneralizedTime({ valueDate: input.status.revokedAt }),
              ...(input.status.reason
                ? [
                    new asn1js.Constructed({
                      idBlock: context(0),
                      value: [new asn1js.Enumerated({ value: REASON_CODES[input.status.reason] })],
                    }),
                  ]
                : []),
            ],
          });
  const single = new pkijs.SingleResponse({ certID, certStatus, thisUpdate: input.thisUpdate });
  if (input.nextUpdate) single.nextUpdate = input.nextUpdate;

  const basic = new pkijs.BasicOCSPResponse();
  const signerCertificate = input.signer.certificate;
  if (input.responderId === 'key') {
    const key = signerCertificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
    basic.tbsResponseData.responderID = new asn1js.OctetString({
      valueHex: await engine.digest('SHA-1', toArrayBuffer(key)),
    });
  } else {
    basic.tbsResponseData.responderID = signerCertificate.subject;
  }
  basic.tbsResponseData.producedAt = input.producedAt;
  basic.tbsResponseData.responses.push(single);
  const own = bytesEqual(
    new Uint8Array(signerCertificate.toSchema(true).toBER(false)),
    new Uint8Array(input.issuer.toSchema(true).toBER(false)),
  );
  if (!own) basic.certs = [signerCertificate];
  await basic.sign(input.signer.privateKey, 'SHA-256');

  const response = new pkijs.OCSPResponse();
  response.responseStatus.valueBlock.valueDec = 0;
  response.responseBytes = new pkijs.ResponseBytes({
    responseType: OID.ocspBasic,
    response: new asn1js.OctetString({ valueHex: basic.toSchema().toBER(false) }),
  });
  return new Uint8Array(response.toSchema().toBER(false));
}

/** Build a CRL: every certificate `issuer` withdrew, as of `thisUpdate` (RFC 5280 §5). */
export async function buildCrl(input: {
  issuer: Issuer;
  thisUpdate: Date;
  nextUpdate?: Date | null;
  revoked: { serialNumber: asn1js.Integer; at: Date; reason?: RevocationReason | null }[];
  /** Extensions beyond the CRL number, for a list that is not a plain full one. */
  extensions?: pkijs.Extension[];
}): Promise<Uint8Array> {
  ensureEngine();
  const crl = new pkijs.CertificateRevocationList();
  crl.version = 1;
  crl.issuer = input.issuer.certificate.subject;
  crl.thisUpdate = x509Time(input.thisUpdate);
  if (input.nextUpdate) crl.nextUpdate = x509Time(input.nextUpdate);
  if (input.revoked.length > 0) {
    crl.revokedCertificates = input.revoked.map(
      (entry) =>
        new pkijs.RevokedCertificate({
          userCertificate: entry.serialNumber,
          revocationDate: x509Time(entry.at),
          ...(entry.reason
            ? {
                crlEntryExtensions: new pkijs.Extensions({
                  extensions: [
                    new pkijs.Extension({
                      extnID: OID.crlReason,
                      critical: false,
                      extnValue: new asn1js.Enumerated({
                        value: REASON_CODES[entry.reason],
                      }).toBER(false),
                    }),
                  ],
                }),
              }
            : {}),
        }),
    );
  }
  crl.crlExtensions = new pkijs.Extensions({
    extensions: [
      new pkijs.Extension({
        extnID: OID.crlNumber,
        critical: false,
        extnValue: new asn1js.Integer({ value: 1 }).toBER(false),
      }),
      ...(input.extensions ?? []),
    ],
  });
  await crl.sign(input.issuer.privateKey, 'SHA-256');
  return new Uint8Array(crl.toSchema(true).toBER(false));
}

export interface TestCertificateAuthority {
  /** DER of the authority's own certificate: the one to trust. */
  readonly certificate: Uint8Array;
  /**
   * Issue a signer: a fresh key with a certificate from this authority, which names where to
   * ask whether it was withdrawn. Its chain is its certificate, then the authority's.
   */
  issueSigner(options?: {
    commonName?: string;
    algorithm?: 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA';
    hash?: 'sha256' | 'sha384' | 'sha512';
    /**
     * Issue a certificate that can't be withdrawn, as a signing service does for one that
     * lives for minutes: it names no address to ask at, only where its issuer's certificate
     * is, and says so in an extension. `revoke()` refuses it.
     */
    unrevocable?: Unrevocable;
  }): Promise<TestSigner>;
  /** The authority's answers, from memory: what a real one serves at the addresses it names. */
  readonly revocation: RevocationSource;
  /** Withdraw a certificate this authority issued, as of `at` (now by default). */
  revoke(
    signer: Pick<TestSigner, 'certificate'> | Uint8Array,
    options?: { at?: Date; reason?: RevocationReason },
  ): void;
}

/**
 * A throwaway certificate authority. It answers OCSP questions through a responder it
 * certified, as real ones do, and publishes a CRL; both say the same.
 *
 * `url` is the address its certificates name. Nothing listens there: `revocation` answers for
 * it. `now` is the authority's clock, for a test that needs another time: its certificates and
 * its answers are dated by it, so an answer is never from before the responder's certificate.
 */
export async function createTestCertificateAuthority(
  options: { commonName?: string; url?: string; now?: () => Date } = {},
): Promise<TestCertificateAuthority> {
  ensureEngine();
  const now = options.now ?? (() => new Date());
  const url = (options.url ?? 'http://test-authority.example').replace(/\/$/, '');
  const addresses = { ocsp: `${url}/ocsp`, crl: `${url}/crl`, issuer: `${url}/issuer` };
  const commonName = options.commonName ?? 'EmbedPDF test certificate authority';
  /** The dates of a certificate issued now, by the authority's clock: from a day before, for a year. */
  const dates = () => ({
    notBefore: new Date(now().getTime() - DAY),
    notAfter: new Date(now().getTime() + 365 * DAY),
  });

  const rootKeys = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
  const root: Issuer = {
    certificate: await issueCertificate({
      kind: 'authority',
      commonName,
      publicKey: rootKeys.publicKey,
      privateKey: rootKeys.privateKey,
      ...dates(),
    }),
    privateKey: rootKeys.privateKey,
  };
  const responderKeys = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
  const responder: Issuer = {
    certificate: await issueCertificate({
      kind: 'responder',
      commonName: `${commonName} (OCSP responder)`,
      publicKey: responderKeys.publicKey,
      issuer: root,
      ...dates(),
    }),
    privateKey: responderKeys.privateKey,
  };
  const der = (certificate: pkijs.Certificate) =>
    new Uint8Array(certificate.toSchema(true).toBER(false));
  const rootDer = der(root.certificate);

  const issued: pkijs.Certificate[] = [];
  /** The ones issued as certificates that can't be withdrawn: `revoke()` refuses them. */
  const unrevocableOnes = new Set<pkijs.Certificate>();
  const revoked = new Map<pkijs.Certificate, { at: Date; reason: RevocationReason | null }>();
  const serialOf = (certificate: pkijs.Certificate) =>
    new Uint8Array(certificate.serialNumber.valueBlock.valueHexView);
  const bySerial = (serial: Uint8Array) =>
    issued.find((certificate) => bytesEqual(serialOf(certificate), serial)) ?? null;

  const answer = async (request: RevocationRequest): Promise<Uint8Array> => {
    if (!request.url.startsWith(url)) {
      throw new Error(`the test certificate authority does not answer at ${request.url}`);
    }
    if (request.kind === 'issuer') return rootDer;
    if (request.kind === 'crl') {
      return buildCrl({
        issuer: root,
        thisUpdate: now(),
        nextUpdate: new Date(now().getTime() + 7 * DAY),
        revoked: [...revoked].map(([certificate, entry]) => ({
          serialNumber: certificate.serialNumber,
          at: entry.at,
          reason: entry.reason,
        })),
      });
    }
    const parsed = asn1js.fromBER(toArrayBuffer(request.body));
    if (parsed.offset === -1) throw new Error('the OCSP request is not valid DER');
    const asked = new pkijs.OCSPRequest({ schema: parsed.result }).tbsRequest.requestList[0];
    if (!asked) throw new Error('the OCSP request asks about no certificate');
    const certificate = bySerial(
      new Uint8Array(asked.reqCert.serialNumber.valueBlock.valueHexView),
    );
    const entry = certificate ? revoked.get(certificate) : undefined;
    return buildOcspResponse({
      // A serial number the authority never issued still gets an answer, about the identifier
      // asked with: one that says the authority has no such certificate.
      certificate: certificate ?? root.certificate,
      issuer: root.certificate,
      asked: asked.reqCert,
      signer: responder,
      status: !certificate
        ? 'unknown'
        : entry
          ? { revokedAt: entry.at, reason: entry.reason }
          : 'good',
      producedAt: now(),
      thisUpdate: now(),
      nextUpdate: new Date(now().getTime() + HOUR),
    });
  };

  return {
    certificate: rootDer,
    async issueSigner(signerOptions = {}) {
      const hash = signerOptions.hash ?? 'sha256';
      const keys = await generateSigningKeyPair(
        signerOptions.algorithm ?? 'RSA-PKCS1-v1_5',
        hash,
        true,
      );
      const { unrevocable } = signerOptions;
      const certificate = await issueCertificate({
        kind: 'signer',
        commonName: signerOptions.commonName ?? 'EmbedPDF test signer',
        publicKey: keys.publicKey,
        issuer: root,
        // What can't be withdrawn has nowhere to ask about it.
        addresses: unrevocable ? { issuer: addresses.issuer } : addresses,
        ...(unrevocable ? { unrevocable } : {}),
        ...dates(),
      });
      issued.push(certificate);
      if (unrevocable) unrevocableOnes.add(certificate);
      const leaf = der(certificate);
      const signer = webCryptoSigner({
        privateKey: keys.privateKey,
        certificateChain: [leaf, rootDer],
        hash,
      });
      return { ...signer, certificate: leaf, privateKey: keys.privateKey };
    },
    revocation: { fetch: answer },
    revoke(signer, revokeOptions = {}) {
      const bytes = signer instanceof Uint8Array ? signer : signer.certificate;
      const certificate = issued.find((candidate) => bytesEqual(der(candidate), bytes));
      if (!certificate) {
        throw new Error('the test certificate authority did not issue this certificate');
      }
      if (unrevocableOnes.has(certificate)) {
        throw new Error('this certificate was issued as one that cannot be withdrawn');
      }
      revoked.set(certificate, {
        at: revokeOptions.at ?? now(),
        reason: revokeOptions.reason ?? null,
      });
    },
  };
}

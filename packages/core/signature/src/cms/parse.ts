import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { bytesEqual, toArrayBuffer } from './engine';
import { DIGEST_BY_OID, OID } from './oids';

/** What a detached CMS says about itself. Nothing here is verified. */
export interface ParsedCms {
  digestAlgorithm: DigestAlgorithm;
  /** The `message-digest` signed attribute: what the signer claims the content hashes to. */
  messageDigest: Uint8Array;
  /** The CMS `signing-time` signed attribute as an ISO 8601 string, when present (PAdES forbids it; the PDF's `/M` is the claim there). */
  signingTime: string | null;
  /** DER of the signer's certificate. */
  signerCertificate: Uint8Array;
  /** DER of every certificate carried by the CMS, signer first. */
  certificates: Uint8Array[];
  /** The signature algorithm OID (`1.2.840.113549.1.1.11` = sha256WithRSAEncryption, …). */
  signatureAlgorithm: string;
  /** The ESS `signing-certificate-v2` attribute is present (a CAdES requirement). */
  signingCertificateV2: boolean;
  /** DER of the first RFC 3161 timestamp token carried as an unsigned attribute, when present. */
  timestampToken: Uint8Array | null;
}

export class CmsError extends Error {
  constructor(
    readonly reason: 'malformed' | 'unsupported',
    message: string,
  ) {
    super(message);
    this.name = 'CmsError';
  }
}

/**
 * How a CMS names the certificate that signed it: an ESS certificate identifier, the hash of
 * that certificate (RFC 5035). `signing-certificate` always hashes with SHA-1;
 * `signing-certificate-v2` names its hash, SHA-256 when it names none.
 */
export interface CertificateBinding {
  version: 1 | 2;
  /** The identifier's hash algorithm, or null for one this package doesn't know. */
  algorithm: DigestAlgorithm | null;
  /** The hash the attribute gives for the signer's certificate. */
  certHash: Uint8Array;
}

/**
 * A SignedData and its one signer, read without needing the signer's certificate: a timestamp
 * token may leave its authority's certificate to the signature it sits in.
 */
export interface CmsParts {
  signedData: pkijs.SignedData;
  signerInfo: pkijs.SignerInfo;
  digestAlgorithm: DigestAlgorithm;
  messageDigest: Uint8Array;
  signingTime: string | null;
  /** The signer's certificate: one the CMS carries, else one of those offered; null when neither has it. */
  signerCertificate: pkijs.Certificate | null;
  /** The signer's certificate when it was found, then the others the CMS carries. */
  certificates: pkijs.Certificate[];
  /** Every binding of the signer's certificate the CMS carries, `signing-certificate-v2` first. */
  bindings: CertificateBinding[];
  /** DER of every RFC 3161 token among the unsigned attributes, in the order the CMS carries them. */
  timestampTokens: Uint8Array[];
  /** A timestamp token's encapsulated TSTInfo (`content: 'tst-info'`); null for a detached CMS. */
  eContent: Uint8Array | null;
}

export interface ParsedCmsInternal extends CmsParts {
  parsed: ParsedCms;
  signerCertificate: pkijs.Certificate;
}

/**
 * What the CMS carries: nothing (a detached PDF signature over the
 * `/ByteRange`), or an RFC 3161 TSTInfo (a document timestamp's token,
 * whose message imprint is the `/ByteRange` digest).
 */
export type CmsContent = 'detached' | 'tst-info';

/** Where to look for a signer's certificate the CMS doesn't carry itself. */
export interface CmsParseOptions {
  /** Certificates from outside the CMS: for a timestamp token, those of the signature it sits in. */
  certificates?: pkijs.Certificate[];
}

/** Parse a detached CMS SignedData with exactly one signer. Throws `CmsError`. */
export function parseDetachedCms(cms: Uint8Array): ParsedCms {
  return parseCmsInternal(cms).parsed;
}

/** {@link readCmsParts}, for a CMS that must carry its signer's certificate. Throws `CmsError`. */
export function parseCmsInternal(
  cms: Uint8Array,
  content: CmsContent = 'detached',
  options: CmsParseOptions = {},
): ParsedCmsInternal {
  const parts = readCmsParts(cms, content, options);
  const internal = withSignerCertificate(parts);
  if (!internal) {
    throw new CmsError('malformed', 'the signer certificate is not carried by the CMS');
  }
  return internal;
}

/** The parts as a parsed CMS, or null when the signer's certificate was found nowhere. */
export function withSignerCertificate(parts: CmsParts): ParsedCmsInternal | null {
  const signerCertificate = parts.signerCertificate;
  if (!signerCertificate) return null;
  return {
    ...parts,
    signerCertificate,
    parsed: {
      digestAlgorithm: parts.digestAlgorithm,
      messageDigest: parts.messageDigest,
      signingTime: parts.signingTime,
      signerCertificate: certDer(signerCertificate),
      certificates: parts.certificates.map(certDer),
      signatureAlgorithm: parts.signerInfo.signatureAlgorithm.algorithmId,
      signingCertificateV2: parts.bindings.some((binding) => binding.version === 2),
      timestampToken: parts.timestampTokens[0] ?? null,
    },
  };
}

/** Read a CMS SignedData with exactly one signer. Throws `CmsError`. */
export function readCmsParts(
  cms: Uint8Array,
  content: CmsContent = 'detached',
  options: CmsParseOptions = {},
): CmsParts {
  if (cms.byteLength === 0) throw new CmsError('malformed', 'empty CMS');
  const asn1 = asn1js.fromBER(toArrayBuffer(cms));
  if (asn1.offset === -1) throw new CmsError('malformed', 'CMS is not valid BER');

  let contentInfo: pkijs.ContentInfo;
  let signedData: pkijs.SignedData;
  try {
    contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
    if (contentInfo.contentType !== OID.signedData) {
      throw new CmsError(
        'unsupported',
        `CMS content type ${contentInfo.contentType} is not SignedData`,
      );
    }
    signedData = new pkijs.SignedData({ schema: contentInfo.content });
  } catch (error) {
    if (error instanceof CmsError) throw error;
    throw new CmsError(
      'malformed',
      `CMS does not parse as SignedData: ${(error as Error).message}`,
    );
  }
  const encapsulated = signedData.encapContentInfo;
  const expectedContentType = content === 'tst-info' ? OID.tstInfo : OID.data;
  let eContent: Uint8Array | null = null;
  if (content === 'detached') {
    if (encapsulated.eContent) {
      throw new CmsError(
        'unsupported',
        'CMS carries encapsulated content; a PDF signature is detached',
      );
    }
  } else {
    if (encapsulated.eContentType !== OID.tstInfo || !encapsulated.eContent) {
      throw new CmsError('malformed', 'a timestamp token must carry a TSTInfo');
    }
    eContent = new Uint8Array(encapsulated.eContent.getValue());
  }
  if (signedData.signerInfos.length !== 1) {
    throw new CmsError(
      'unsupported',
      `CMS has ${signedData.signerInfos.length} signers; exactly one is expected`,
    );
  }
  const signerInfo = signedData.signerInfos[0];
  const digestAlgorithm = DIGEST_BY_OID[signerInfo.digestAlgorithm.algorithmId];
  if (!digestAlgorithm) {
    throw new CmsError('unsupported', `digest algorithm ${signerInfo.digestAlgorithm.algorithmId}`);
  }

  rememberCertificateBytes(contentInfo, signedData);
  const carried = (signedData.certificates ?? []).filter(
    (certificate): certificate is pkijs.Certificate => certificate instanceof pkijs.Certificate,
  );
  const signerCertificate =
    findSignerCertificate(signerInfo, carried) ??
    findSignerCertificate(signerInfo, options.certificates ?? []);

  const signedAttrs = signerInfo.signedAttrs?.attributes ?? [];
  if (signedAttrs.length === 0) {
    throw new CmsError(
      'unsupported',
      'CMS has no signed attributes; a PDF signature needs message-digest',
    );
  }
  const attr = (type: string): pkijs.Attribute | undefined =>
    signedAttrs.find((attribute) => attribute.type === type);
  const contentType = attr(OID.contentType);
  if (contentType) {
    const oid = contentType.values[0] as asn1js.ObjectIdentifier | undefined;
    if (!oid || oid.valueBlock.toString() !== expectedContentType) {
      throw new CmsError(
        'unsupported',
        `CMS content-type attribute is not ${content === 'tst-info' ? 'id-ct-TSTInfo' : 'id-data'}`,
      );
    }
  }
  const messageDigestAttr = attr(OID.messageDigest);
  const messageDigestValue = messageDigestAttr?.values[0] as asn1js.OctetString | undefined;
  if (!messageDigestValue || !(messageDigestValue instanceof asn1js.OctetString)) {
    throw new CmsError('malformed', 'CMS has no message-digest attribute');
  }
  const messageDigest = new Uint8Array(messageDigestValue.valueBlock.valueHexView);

  let signingTime: string | null = null;
  const signingTimeAttr = attr(OID.signingTime);
  const timeValue = signingTimeAttr?.values[0];
  if (timeValue instanceof asn1js.UTCTime || timeValue instanceof asn1js.GeneralizedTime) {
    signingTime = timeValue.toDate().toISOString();
  }

  const bindings: CertificateBinding[] = [];
  const bindingV2 = attr(OID.signingCertificateV2);
  if (bindingV2) bindings.push(readBinding(bindingV2, 2));
  const bindingV1 = attr(OID.signingCertificate);
  if (bindingV1) bindings.push(readBinding(bindingV1, 1));

  const timestampTokens: Uint8Array[] = [];
  for (const attribute of signerInfo.unsignedAttrs?.attributes ?? []) {
    if (attribute.type !== OID.timestampToken) continue;
    for (const value of attribute.values) timestampTokens.push(encodingOf(value));
  }

  return {
    signedData,
    signerInfo,
    digestAlgorithm,
    messageDigest,
    signingTime,
    signerCertificate,
    certificates: signerCertificate
      ? [signerCertificate, ...carried.filter((certificate) => certificate !== signerCertificate)]
      : carried,
    bindings,
    timestampTokens,
    eContent,
  };
}

/**
 * Read an ESS certificate identifier attribute. The first identifier names the signer:
 *
 *     SigningCertificate   ::= sequence { certs sequence of ESSCertID, ... }
 *     ESSCertID            ::= sequence { certHash octet string, ... }
 *     SigningCertificateV2 ::= sequence { certs sequence of ESSCertIDv2, ... }
 *     ESSCertIDv2          ::= sequence { hashAlgorithm default sha256, certHash octet string, ... }
 */
function readBinding(attribute: pkijs.Attribute, version: 1 | 2): CertificateBinding {
  const name = version === 2 ? 'signing-certificate-v2' : 'signing-certificate';
  const seq = attribute.values[0] as asn1js.Sequence | undefined;
  const certs = seq?.valueBlock?.value?.[0] as asn1js.Sequence | undefined;
  const first = certs?.valueBlock?.value?.[0] as asn1js.Sequence | undefined;
  const members = first?.valueBlock?.value ?? [];
  let algorithm: DigestAlgorithm | null = version === 2 ? 'sha256' : 'sha1';
  let cursor = 0;
  // hashAlgorithm is optional and, when present, the first member: a sequence starting with an
  // OID. issuerSerial is also a sequence but follows the certHash.
  const head = members[0];
  if (
    version === 2 &&
    head instanceof asn1js.Sequence &&
    head.valueBlock.value[0] instanceof asn1js.ObjectIdentifier
  ) {
    const oid = (head.valueBlock.value[0] as asn1js.ObjectIdentifier).valueBlock.toString();
    algorithm = DIGEST_BY_OID[oid] ?? null;
    cursor = 1;
  }
  const hash = members[cursor];
  if (!(hash instanceof asn1js.OctetString)) {
    throw new CmsError('malformed', `${name} carries no certHash`);
  }
  return { version, algorithm, certHash: new Uint8Array(hash.valueBlock.valueHexView) };
}

/** The bytes a decoded value was read from, so it is handed on exactly as it was written. */
function encodingOf(value: asn1js.AsnType): Uint8Array {
  const written = (value as asn1js.BaseBlock).valueBeforeDecodeView;
  return written.byteLength > 0
    ? new Uint8Array(written)
    : new Uint8Array((value as asn1js.BaseBlock).toBER(false));
}

/** Each parsed certificate's bytes as its CMS wrote them. */
const CERTIFICATE_BYTES = new WeakMap<pkijs.Certificate, Uint8Array>();

/**
 * Keep the bytes of the certificates a SignedData carries. A binding hashes a certificate as it
 * was written, and writing a parsed certificate out again need not give the same bytes.
 */
function rememberCertificateBytes(contentInfo: pkijs.ContentInfo, signedData: pkijs.SignedData) {
  const members = (contentInfo.content as asn1js.Sequence).valueBlock?.value ?? [];
  // certificates [0] implicit: the one context-tagged member numbered 0.
  const set = members.find(
    (member) => member.idBlock.tagClass === 3 && member.idBlock.tagNumber === 0,
  ) as asn1js.Constructed | undefined;
  const written = set?.valueBlock?.value ?? [];
  (signedData.certificates ?? []).forEach((certificate, index) => {
    const block = written[index];
    if (certificate instanceof pkijs.Certificate && block) {
      CERTIFICATE_BYTES.set(certificate, encodingOf(block));
    }
  });
}

/** DER of a certificate: the bytes it was parsed from, or its encoding when it was built here. */
export function certDer(cert: pkijs.Certificate): Uint8Array {
  return CERTIFICATE_BYTES.get(cert) ?? new Uint8Array(cert.toSchema(true).toBER(false));
}

/** Parse a DER certificate, keeping its bytes for {@link certDer}. */
export function certificateFromDer(der: Uint8Array): pkijs.Certificate {
  const certificate = pkijs.Certificate.fromBER(toArrayBuffer(der));
  CERTIFICATE_BYTES.set(certificate, der);
  return certificate;
}

function findSignerCertificate(
  signerInfo: pkijs.SignerInfo,
  certificates: pkijs.Certificate[],
): pkijs.Certificate | null {
  const sid = signerInfo.sid;
  if (sid instanceof pkijs.IssuerAndSerialNumber) {
    for (const cert of certificates) {
      if (
        cert.issuer.isEqual(sid.issuer) &&
        bytesEqual(
          new Uint8Array(cert.serialNumber.valueBlock.valueHexView),
          new Uint8Array(sid.serialNumber.valueBlock.valueHexView),
        )
      ) {
        return cert;
      }
    }
    return null;
  }
  // SubjectKeyIdentifier: [0] implicit octet string.
  const ski = (sid as asn1js.Primitive | undefined)?.valueBlock?.valueHexView;
  if (!ski) return null;
  for (const cert of certificates) {
    const ext = cert.extensions?.find((extension) => extension.extnID === OID.subjectKeyIdentifier);
    const value = ext ? asn1js.fromBER(ext.extnValue.valueBlock.valueHexView) : null;
    const inner = value && value.offset !== -1 ? (value.result as asn1js.OctetString) : null;
    if (inner && bytesEqual(new Uint8Array(inner.valueBlock.valueHexView), new Uint8Array(ski))) {
      return cert;
    }
  }
  return null;
}

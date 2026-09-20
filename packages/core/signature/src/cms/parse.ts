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
  /** The CMS `signing-time` signed attribute, when present (PAdES forbids it; the PDF's `/M` is the claim there). */
  signingTime: Date | null;
  /** DER of the signer's certificate. */
  signerCertificate: Uint8Array;
  /** DER of every certificate carried by the CMS, signer first. */
  certificates: Uint8Array[];
  /** The signature algorithm OID (`1.2.840.113549.1.1.11` = sha256WithRSAEncryption, …). */
  signatureAlgorithm: string;
  /** The ESS `signing-certificate-v2` attribute is present (a CAdES requirement). */
  signingCertificateV2: boolean;
  /** DER of an RFC 3161 timestamp token carried as an unsigned attribute, when present. */
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

export interface ParsedCmsInternal {
  parsed: ParsedCms;
  signedData: pkijs.SignedData;
  signerInfo: pkijs.SignerInfo;
  signerCertificate: pkijs.Certificate;
  certificates: pkijs.Certificate[];
  /** DER of the signing-certificate-v2 attribute's first certHash, when present. */
  essCertHash: Uint8Array | null;
}

/** Parse a detached CMS SignedData with exactly one signer. Throws `CmsError`. */
export function parseDetachedCms(cms: Uint8Array): ParsedCms {
  return parseCmsInternal(cms).parsed;
}

export function parseCmsInternal(cms: Uint8Array): ParsedCmsInternal {
  if (cms.byteLength === 0) throw new CmsError('malformed', 'empty CMS');
  const asn1 = asn1js.fromBER(toArrayBuffer(cms));
  if (asn1.offset === -1) throw new CmsError('malformed', 'CMS is not valid BER');

  let contentInfo: pkijs.ContentInfo;
  let signedData: pkijs.SignedData;
  try {
    contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
    if (contentInfo.contentType !== OID.signedData) {
      throw new CmsError('unsupported', `CMS content type ${contentInfo.contentType} is not SignedData`);
    }
    signedData = new pkijs.SignedData({ schema: contentInfo.content });
  } catch (err) {
    if (err instanceof CmsError) throw err;
    throw new CmsError('malformed', `CMS does not parse as SignedData: ${(err as Error).message}`);
  }
  if (signedData.encapContentInfo.eContent) {
    throw new CmsError('unsupported', 'CMS carries encapsulated content; a PDF signature is detached');
  }
  if (signedData.signerInfos.length !== 1) {
    throw new CmsError('unsupported', `CMS has ${signedData.signerInfos.length} signers; exactly one is expected`);
  }
  const signerInfo = signedData.signerInfos[0];
  const digestAlgorithm = DIGEST_BY_OID[signerInfo.digestAlgorithm.algorithmId];
  if (!digestAlgorithm) {
    throw new CmsError('unsupported', `digest algorithm ${signerInfo.digestAlgorithm.algorithmId}`);
  }

  const certificates = (signedData.certificates ?? []).filter(
    (c): c is pkijs.Certificate => c instanceof pkijs.Certificate,
  );
  const signerCertificate = findSignerCertificate(signerInfo, certificates);
  if (!signerCertificate) {
    throw new CmsError('malformed', 'the signer certificate is not carried by the CMS');
  }

  const signedAttrs = signerInfo.signedAttrs?.attributes ?? [];
  if (signedAttrs.length === 0) {
    throw new CmsError('unsupported', 'CMS has no signed attributes; a PDF signature needs message-digest');
  }
  const attr = (type: string): pkijs.Attribute | undefined => signedAttrs.find((a) => a.type === type);
  const contentType = attr(OID.contentType);
  if (contentType && contentType.values[0]?.valueBlock?.toString?.() !== OID.data) {
    const oid = contentType.values[0] as asn1js.ObjectIdentifier | undefined;
    if (!oid || oid.valueBlock.toString() !== OID.data) {
      throw new CmsError('unsupported', 'CMS content-type attribute is not id-data');
    }
  }
  const messageDigestAttr = attr(OID.messageDigest);
  const messageDigestValue = messageDigestAttr?.values[0] as asn1js.OctetString | undefined;
  if (!messageDigestValue || !(messageDigestValue instanceof asn1js.OctetString)) {
    throw new CmsError('malformed', 'CMS has no message-digest attribute');
  }
  const messageDigest = new Uint8Array(messageDigestValue.valueBlock.valueHexView);

  let signingTime: Date | null = null;
  const signingTimeAttr = attr(OID.signingTime);
  const timeValue = signingTimeAttr?.values[0];
  if (timeValue instanceof asn1js.UTCTime || timeValue instanceof asn1js.GeneralizedTime) {
    signingTime = timeValue.toDate();
  }

  const essAttr = attr(OID.signingCertificateV2);
  let essCertHash: Uint8Array | null = null;
  if (essAttr) {
    // SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2, ... }
    // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256, certHash OCTET STRING, ... }
    const seq = essAttr.values[0] as asn1js.Sequence | undefined;
    const certs = seq?.valueBlock?.value?.[0] as asn1js.Sequence | undefined;
    const first = certs?.valueBlock?.value?.[0] as asn1js.Sequence | undefined;
    const members = first?.valueBlock?.value ?? [];
    // hashAlgorithm is OPTIONAL (DEFAULT sha256) and, when present, the
    // first member: a SEQUENCE starting with an OID. issuerSerial is also a
    // SEQUENCE but follows the certHash.
    let cursor = 0;
    const head = members[0];
    if (head instanceof asn1js.Sequence && head.valueBlock.value[0] instanceof asn1js.ObjectIdentifier) {
      const algOid = head.valueBlock.value[0] as asn1js.ObjectIdentifier;
      if (algOid.valueBlock.toString() !== OID.sha256) {
        throw new CmsError('unsupported', 'signing-certificate-v2 uses a hash other than SHA-256');
      }
      cursor = 1;
    }
    const hash = members[cursor];
    if (!(hash instanceof asn1js.OctetString)) {
      throw new CmsError('malformed', 'signing-certificate-v2 carries no certHash');
    }
    essCertHash = new Uint8Array(hash.valueBlock.valueHexView);
  }

  let timestampToken: Uint8Array | null = null;
  const tokenAttr = signerInfo.unsignedAttrs?.attributes.find((a) => a.type === OID.timestampToken);
  if (tokenAttr?.values[0]) {
    timestampToken = new Uint8Array((tokenAttr.values[0] as asn1js.Sequence).toBER(false));
  }

  const ordered = [signerCertificate, ...certificates.filter((c) => c !== signerCertificate)];
  return {
    parsed: {
      digestAlgorithm,
      messageDigest,
      signingTime,
      signerCertificate: certDer(signerCertificate),
      certificates: ordered.map(certDer),
      signatureAlgorithm: signerInfo.signatureAlgorithm.algorithmId,
      signingCertificateV2: essAttr !== undefined,
      timestampToken,
    },
    signedData,
    signerInfo,
    signerCertificate,
    certificates: ordered,
    essCertHash,
  };
}

export function certDer(cert: pkijs.Certificate): Uint8Array {
  return new Uint8Array(cert.toSchema(true).toBER(false));
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
  // SubjectKeyIdentifier: [0] IMPLICIT OCTET STRING.
  const ski = (sid as asn1js.Primitive | undefined)?.valueBlock?.valueHexView;
  if (!ski) return null;
  for (const cert of certificates) {
    const ext = cert.extensions?.find((e) => e.extnID === OID.subjectKeyIdentifier);
    const value = ext ? asn1js.fromBER(ext.extnValue.valueBlock.valueHexView) : null;
    const inner = value && value.offset !== -1 ? (value.result as asn1js.OctetString) : null;
    if (inner && bytesEqual(new Uint8Array(inner.valueBlock.valueHexView), new Uint8Array(ski))) {
      return cert;
    }
  }
  return null;
}

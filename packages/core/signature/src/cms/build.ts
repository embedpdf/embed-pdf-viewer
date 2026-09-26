import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { ensureEngine, toArrayBuffer } from './engine';
import { DIGEST_LENGTH, OID, OID_BY_DIGEST } from './oids';

export type SignatureProfile = 'pkcs7' | 'cades-b';
export type RawSignatureAlgorithm = 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA';

/**
 * Something that signs bytes with a private key it never hands out: a
 * WebCrypto key, an HSM, a smart card. `sign` receives the DER of the CMS
 * signed attributes and returns the raw signature (for ECDSA: `r || s`,
 * as WebCrypto produces it; the CMS encoding is done here).
 */
export interface RawSigner {
  readonly kind: 'raw';
  /** DER certificates, the signer's first, then its issuers. */
  readonly certificateChain: Uint8Array[];
  readonly algorithm: RawSignatureAlgorithm;
  readonly hash: Exclude<DigestAlgorithm, 'sha1'>;
  sign(signedAttributesDer: Uint8Array): Promise<Uint8Array>;
}

export interface BuildDetachedCmsInput {
  /** The digest the engine prepared (over the `/ByteRange`). */
  digest: Uint8Array;
  hash: Exclude<DigestAlgorithm, 'sha1'>;
  profile: SignatureProfile;
  signer: RawSigner;
  /** `pkcs7` only: the CMS `signing-time` attribute. PAdES (`cades-b`) never carries one. */
  signingTime?: Date;
}

/**
 * Build a detached CMS SignedData around a raw signature: content-type,
 * message-digest, and for CAdES-B the ESS signing-certificate-v2 attribute;
 * the signer's certificate chain; one SignerInfo identified by issuer and
 * serial number.
 */
export async function buildDetachedCms(input: BuildDetachedCmsInput): Promise<Uint8Array> {
  const engine = ensureEngine();
  if (input.digest.byteLength !== DIGEST_LENGTH[input.hash]) {
    throw new Error(
      `digest is ${input.digest.byteLength} bytes; ${input.hash} needs ${DIGEST_LENGTH[input.hash]}`,
    );
  }
  if (input.signer.hash !== input.hash) {
    throw new Error(
      `the signer hashes with ${input.signer.hash}, the document was prepared with ${input.hash}`,
    );
  }
  if (input.signer.certificateChain.length === 0) {
    throw new Error('the signer carries no certificate');
  }
  const chain = input.signer.certificateChain.map((der) =>
    pkijs.Certificate.fromBER(toArrayBuffer(der)),
  );
  const signerCert = chain[0];

  const attributes: pkijs.Attribute[] = [
    new pkijs.Attribute({
      type: OID.contentType,
      values: [new asn1js.ObjectIdentifier({ value: OID.data })],
    }),
    new pkijs.Attribute({
      type: OID.messageDigest,
      values: [new asn1js.OctetString({ valueHex: toArrayBuffer(input.digest) })],
    }),
  ];
  if (input.profile === 'pkcs7' && input.signingTime) {
    attributes.push(
      new pkijs.Attribute({
        type: OID.signingTime,
        values: [new asn1js.UTCTime({ valueDate: input.signingTime })],
      }),
    );
  }
  if (input.profile === 'cades-b') {
    const certHash = await engine.digest(
      'SHA-256',
      toArrayBuffer(input.signer.certificateChain[0]),
    );
    const issuerSerial = new pkijs.IssuerSerial({
      issuer: new pkijs.GeneralNames({
        names: [new pkijs.GeneralName({ type: 4, value: signerCert.issuer })],
      }),
      serialNumber: signerCert.serialNumber,
    });
    // ESSCertIDv2 with the default hash algorithm (SHA-256) omitted.
    const essCertId = new asn1js.Sequence({
      value: [new asn1js.OctetString({ valueHex: certHash }), issuerSerial.toSchema()],
    });
    attributes.push(
      new pkijs.Attribute({
        type: OID.signingCertificateV2,
        values: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [essCertId] })] })],
      }),
    );
  }

  const digestAlgorithm = new pkijs.AlgorithmIdentifier({ algorithmId: OID_BY_DIGEST[input.hash] });
  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: signerCert.issuer,
      serialNumber: signerCert.serialNumber,
    }),
    digestAlgorithm,
    signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes }),
    signatureAlgorithm: signatureAlgorithmFor(input.signer.algorithm, input.hash),
  });

  const toSign = new asn1js.Set({
    value: attributes.map((attribute) => attribute.toSchema()),
  }).toBER(false);
  const raw = await input.signer.sign(new Uint8Array(toSign));
  signerInfo.signature = new asn1js.OctetString({
    valueHex: cmsSignatureValue(input.signer.algorithm, raw),
  });

  const signedData = new pkijs.SignedData({
    version: 1,
    digestAlgorithms: [digestAlgorithm],
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID.data }),
    certificates: chain,
    signerInfos: [signerInfo],
  });
  const contentInfo = new pkijs.ContentInfo({
    contentType: OID.signedData,
    content: signedData.toSchema(true),
  });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

/** A raw signature as a SignerInfo carries it (ECDSA `r || s` becomes DER). */
export function cmsSignatureValue(algorithm: RawSignatureAlgorithm, raw: Uint8Array): ArrayBuffer {
  return algorithm === 'ECDSA'
    ? pkijs.createCMSECDSASignature(toArrayBuffer(raw))
    : toArrayBuffer(raw);
}

/** The SignerInfo signature algorithm of a raw key and hash. */
export function signatureAlgorithmFor(
  algorithm: RawSignatureAlgorithm,
  hash: Exclude<DigestAlgorithm, 'sha1'>,
): pkijs.AlgorithmIdentifier {
  switch (algorithm) {
    case 'RSA-PKCS1-v1_5':
      return new pkijs.AlgorithmIdentifier({
        algorithmId: {
          sha256: OID.sha256WithRsa,
          sha384: OID.sha384WithRsa,
          sha512: OID.sha512WithRsa,
        }[hash],
        algorithmParams: new asn1js.Null(),
      });
    case 'ECDSA':
      return new pkijs.AlgorithmIdentifier({
        algorithmId: { sha256: OID.ecdsaSha256, sha384: OID.ecdsaSha384, sha512: OID.ecdsaSha512 }[
          hash
        ],
      });
    case 'RSA-PSS': {
      const hashAlgorithm = new pkijs.AlgorithmIdentifier({
        algorithmId: OID_BY_DIGEST[hash],
        algorithmParams: new asn1js.Null(),
      });
      const params = new pkijs.RSASSAPSSParams({
        hashAlgorithm,
        maskGenAlgorithm: new pkijs.AlgorithmIdentifier({
          algorithmId: OID.mgf1,
          algorithmParams: hashAlgorithm.toSchema(),
        }),
        saltLength: DIGEST_LENGTH[hash],
      });
      return new pkijs.AlgorithmIdentifier({
        algorithmId: OID.rsaPss,
        algorithmParams: params.toSchema(),
      });
    }
  }
}

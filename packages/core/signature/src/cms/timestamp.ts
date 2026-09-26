import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { cmsSignatureValue, signatureAlgorithmFor, type RawSigner } from './build';
import { ensureEngine, toArrayBuffer } from './engine';
import { DIGEST_BY_OID, DIGEST_LENGTH, OID, OID_BY_DIGEST, WEBCRYPTO_HASH } from './oids';
import { CmsError } from './parse';

/** What a timestamp token's TSTInfo says: which digest it stamped, and when. */
export interface TimestampInfo {
  imprintAlgorithm: DigestAlgorithm;
  /** The stamped digest: for a document timestamp, the `/ByteRange` digest. */
  imprint: Uint8Array;
  genTime: Date;
}

/** Read a token's TSTInfo (the encapsulated content of an RFC 3161 token). Throws `CmsError`. */
export function readTimestampInfo(eContent: Uint8Array): TimestampInfo {
  const asn1 = asn1js.fromBER(toArrayBuffer(eContent));
  if (asn1.offset === -1) throw new CmsError('malformed', 'TSTInfo is not valid BER');
  let info: pkijs.TSTInfo;
  try {
    info = new pkijs.TSTInfo({ schema: asn1.result });
  } catch (error) {
    throw new CmsError('malformed', `TSTInfo does not parse: ${(error as Error).message}`);
  }
  const algorithm = DIGEST_BY_OID[info.messageImprint.hashAlgorithm.algorithmId];
  if (!algorithm) {
    throw new CmsError(
      'unsupported',
      `message imprint algorithm ${info.messageImprint.hashAlgorithm.algorithmId}`,
    );
  }
  return {
    imprintAlgorithm: algorithm,
    imprint: new Uint8Array(info.messageImprint.hashedMessage.valueBlock.valueHexView),
    genTime: info.genTime,
  };
}

export interface BuildTimestampTokenInput {
  /** The digest to stamp (for a document timestamp, the prepared `/ByteRange` digest). */
  digest: Uint8Array;
  hash: Exclude<DigestAlgorithm, 'sha1'>;
  /** The authority's key and certificate. */
  authority: RawSigner;
  genTime?: Date;
}

/**
 * Build an RFC 3161 timestamp token: a SignedData whose content is a
 * TSTInfo stamping `digest`, signed by the authority over content-type
 * (id-ct-TSTInfo), message-digest (of the TSTInfo) and ESS
 * signing-certificate-v2. What a timestamp authority returns; used by the
 * test authority, never to stamp a real document.
 */
export async function buildTimestampToken(input: BuildTimestampTokenInput): Promise<Uint8Array> {
  const engine = ensureEngine();
  if (input.digest.byteLength !== DIGEST_LENGTH[input.hash]) {
    throw new Error(
      `digest is ${input.digest.byteLength} bytes; ${input.hash} needs ${DIGEST_LENGTH[input.hash]}`,
    );
  }
  const authorityCert = pkijs.Certificate.fromBER(
    toArrayBuffer(input.authority.certificateChain[0]!),
  );
  const serial = globalThis.crypto.getRandomValues(new Uint8Array(8));
  serial[0]! &= 0x7f;
  const info = new pkijs.TSTInfo({
    version: 1,
    policy: '1.3.6.1.4.1.57264.1.1',
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_BY_DIGEST[input.hash] }),
      hashedMessage: new asn1js.OctetString({ valueHex: toArrayBuffer(input.digest) }),
    }),
    serialNumber: new asn1js.Integer({ valueHex: toArrayBuffer(serial) }),
    genTime: input.genTime ?? new Date(),
  });
  const eContent = info.toSchema().toBER(false);
  const contentDigest = await engine.digest(WEBCRYPTO_HASH[input.authority.hash], eContent);
  const certHash = await engine.digest(
    'SHA-256',
    toArrayBuffer(input.authority.certificateChain[0]!),
  );
  const issuerSerial = new pkijs.IssuerSerial({
    issuer: new pkijs.GeneralNames({
      names: [new pkijs.GeneralName({ type: 4, value: authorityCert.issuer })],
    }),
    serialNumber: authorityCert.serialNumber,
  });
  const attributes = [
    new pkijs.Attribute({
      type: OID.contentType,
      values: [new asn1js.ObjectIdentifier({ value: OID.tstInfo })],
    }),
    new pkijs.Attribute({
      type: OID.messageDigest,
      values: [new asn1js.OctetString({ valueHex: contentDigest })],
    }),
    new pkijs.Attribute({
      type: OID.signingCertificateV2,
      values: [
        new asn1js.Sequence({
          value: [
            new asn1js.Sequence({
              value: [
                new asn1js.Sequence({
                  value: [new asn1js.OctetString({ valueHex: certHash }), issuerSerial.toSchema()],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
  const digestAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: OID_BY_DIGEST[input.authority.hash],
  });
  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: authorityCert.issuer,
      serialNumber: authorityCert.serialNumber,
    }),
    digestAlgorithm,
    signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes }),
    signatureAlgorithm: signatureAlgorithmFor(input.authority.algorithm, input.authority.hash),
  });
  const toSign = new asn1js.Set({
    value: attributes.map((attribute) => attribute.toSchema()),
  }).toBER(false);
  const raw = await input.authority.sign(new Uint8Array(toSign));
  signerInfo.signature = new asn1js.OctetString({
    valueHex: cmsSignatureValue(input.authority.algorithm, raw),
  });
  const signedData = new pkijs.SignedData({
    version: 3,
    digestAlgorithms: [digestAlgorithm],
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID.tstInfo,
      eContent: new asn1js.OctetString({ valueHex: eContent }),
    }),
    certificates: [authorityCert],
    signerInfos: [signerInfo],
  });
  const contentInfo = new pkijs.ContentInfo({
    contentType: OID.signedData,
    content: signedData.toSchema(true),
  });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

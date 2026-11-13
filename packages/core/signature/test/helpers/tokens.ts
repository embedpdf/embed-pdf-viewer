import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { cmsSignatureValue, signatureAlgorithmFor, type RawSigner } from '../../src/cms/build';
import { ensureEngine, toArrayBuffer } from '../../src/cms/engine';
import { DIGEST_BY_OID, OID, OID_BY_DIGEST, WEBCRYPTO_HASH } from '../../src/cms/oids';

/**
 * How a test token binds its authority's certificate. `hashOid` names the hash of a
 * `signing-certificate-v2` explicitly (left out: SHA-256, unnamed); an OID no verifier knows
 * gets a made-up hash. `certHash` overrides the hash, to bind another certificate.
 */
export type TestBinding = { version: 1 | 2; hashOid?: string; certHash?: Uint8Array } | null;

/**
 * An RFC 3161 token built apart from the package's own builder, with the parts a verifier has
 * to cope with made adjustable: the binding, whether the authority's certificate is carried,
 * and a TSTInfo swapped after signing.
 */
export async function buildTestToken(input: {
  /** The digest the token stamps. */
  digest: Uint8Array;
  /** The algorithm of that digest. */
  hash?: Exclude<DigestAlgorithm, 'sha1'>;
  authority: RawSigner;
  /** Left out: `signing-certificate-v2` with SHA-256. `null`: no binding at all. */
  binding?: TestBinding;
  /** Whether the token carries the authority's certificate. Default true. */
  carriesCertificate?: boolean;
  genTime?: Date;
  /** Replace the TSTInfo after signing with one of another serial number: same imprint, other bytes. */
  swapsContent?: boolean;
}): Promise<Uint8Array> {
  const engine = ensureEngine();
  const hash = input.hash ?? 'sha256';

  const tstInfo = (serialByte: number) =>
    new pkijs.TSTInfo({
      version: 1,
      policy: '1.3.6.1.4.1.57264.1.1',
      messageImprint: new pkijs.MessageImprint({
        hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_BY_DIGEST[hash] }),
        hashedMessage: new asn1js.OctetString({ valueHex: toArrayBuffer(input.digest) }),
      }),
      serialNumber: new asn1js.Integer({ valueHex: new Uint8Array([serialByte]).buffer }),
      genTime: input.genTime ?? new Date(),
    })
      .toSchema()
      .toBER(false);
  const eContent = tstInfo(1);
  return buildSignedData({
    contentType: OID.tstInfo,
    messageDigest: new Uint8Array(
      await engine.digest(WEBCRYPTO_HASH[input.authority.hash], eContent),
    ),
    eContent: input.swapsContent ? tstInfo(2) : eContent,
    signer: input.authority,
    binding: input.binding === undefined ? { version: 2 } : input.binding,
    carriesCertificate: input.carriesCertificate !== false,
  });
}

/**
 * A detached CMS signature over `digest`, built apart from the package's own builder, with an
 * adjustable binding. Left out: no binding, as `adbe.pkcs7.detached` allows.
 */
export function buildTestSignature(input: {
  digest: Uint8Array;
  signer: RawSigner;
  binding?: TestBinding;
}): Promise<Uint8Array> {
  return buildSignedData({
    contentType: OID.data,
    messageDigest: input.digest,
    eContent: null,
    signer: input.signer,
    binding: input.binding ?? null,
    carriesCertificate: true,
  });
}

/** One SignedData with one signer: a token when it carries a TSTInfo, else a detached signature. */
async function buildSignedData(input: {
  contentType: string;
  messageDigest: Uint8Array;
  eContent: ArrayBuffer | null;
  signer: RawSigner;
  binding: TestBinding;
  carriesCertificate: boolean;
}): Promise<Uint8Array> {
  const signerDer = input.signer.certificateChain[0]!;
  const signerCert = pkijs.Certificate.fromBER(toArrayBuffer(signerDer));
  const attributes = [
    new pkijs.Attribute({
      type: OID.contentType,
      values: [new asn1js.ObjectIdentifier({ value: input.contentType })],
    }),
    new pkijs.Attribute({
      type: OID.messageDigest,
      values: [new asn1js.OctetString({ valueHex: toArrayBuffer(input.messageDigest) })],
    }),
  ];
  if (input.binding) attributes.push(await bindingAttribute(input.binding, signerDer));

  const digestAlgorithm = new pkijs.AlgorithmIdentifier({
    algorithmId: OID_BY_DIGEST[input.signer.hash],
  });
  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: signerCert.issuer,
      serialNumber: signerCert.serialNumber,
    }),
    digestAlgorithm,
    signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes }),
    signatureAlgorithm: signatureAlgorithmFor(input.signer.algorithm, input.signer.hash),
  });
  const toSign = new asn1js.Set({
    value: attributes.map((attribute) => attribute.toSchema()),
  }).toBER(false);
  const raw = await input.signer.sign(new Uint8Array(toSign));
  signerInfo.signature = new asn1js.OctetString({
    valueHex: cmsSignatureValue(input.signer.algorithm, raw),
  });

  const signedData = new pkijs.SignedData({
    version: input.eContent ? 3 : 1,
    digestAlgorithms: [digestAlgorithm],
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: input.contentType,
      ...(input.eContent ? { eContent: new asn1js.OctetString({ valueHex: input.eContent }) } : {}),
    }),
    ...(input.carriesCertificate ? { certificates: [signerCert] } : {}),
    signerInfos: [signerInfo],
  });
  const contentInfo = new pkijs.ContentInfo({
    contentType: OID.signedData,
    content: signedData.toSchema(true),
  });
  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

async function bindingAttribute(
  binding: NonNullable<TestBinding>,
  certificate: Uint8Array,
): Promise<pkijs.Attribute> {
  const engine = ensureEngine();
  const algorithm: DigestAlgorithm | undefined =
    binding.version === 1 ? 'sha1' : binding.hashOid ? DIGEST_BY_OID[binding.hashOid] : 'sha256';
  const certHash =
    binding.certHash ??
    (algorithm
      ? new Uint8Array(await engine.digest(WEBCRYPTO_HASH[algorithm], toArrayBuffer(certificate)))
      : new Uint8Array(32).fill(7));
  const identifier = new asn1js.Sequence({
    value: [
      ...(binding.version === 2 && binding.hashOid
        ? [
            new asn1js.Sequence({
              value: [new asn1js.ObjectIdentifier({ value: binding.hashOid })],
            }),
          ]
        : []),
      new asn1js.OctetString({ valueHex: toArrayBuffer(certHash) }),
    ],
  });
  return new pkijs.Attribute({
    type: binding.version === 2 ? OID.signingCertificateV2 : OID.signingCertificate,
    values: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [identifier] })] })],
  });
}

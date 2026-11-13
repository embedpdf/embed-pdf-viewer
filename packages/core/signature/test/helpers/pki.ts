import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { ensureEngine, toArrayBuffer } from '../../src/cms/engine';
import { OID } from '../../src/cms/oids';
import { generateSigningKeyPair, webCryptoSigner, type RawSigner } from '../../src/index';

/** A key pair and its certificate, for building the small hierarchies a trust test needs. */
export interface TestIdentity {
  /** DER of the identity's certificate. */
  certificate: Uint8Array;
  keys: CryptoKeyPair;
  /** Signs with the identity's key; its chain is its certificate, then its issuers'. */
  signer: RawSigner;
}

const DAY = 24 * 3600 * 1000;

/**
 * Make a certificate: self-signed, or issued by `issuer`. `ca` makes it a certificate authority
 * (key usage `digitalSignature | keyCertSign`); otherwise its key usage is `digitalSignature`
 * alone. `purposes` adds an extended key usage, critical unless `purposesCritical` is false.
 */
export async function createIdentity(input: {
  commonName: string;
  issuer?: TestIdentity;
  ca?: boolean;
  purposes?: string[];
  purposesCritical?: boolean;
  notBefore?: Date;
  notAfter?: Date;
}): Promise<TestIdentity> {
  ensureEngine();
  const keys = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
  const cert = new pkijs.Certificate();
  cert.version = 2;
  const serial = globalThis.crypto.getRandomValues(new Uint8Array(8));
  serial[0]! &= 0x7f;
  cert.serialNumber = new asn1js.Integer({ valueHex: serial.buffer });
  cert.subject.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({
      type: OID.commonName,
      value: new asn1js.Utf8String({ value: input.commonName }),
    }),
  );
  cert.issuer = input.issuer
    ? pkijs.Certificate.fromBER(toArrayBuffer(input.issuer.certificate)).subject
    : cert.subject;
  cert.notBefore.value = input.notBefore ?? new Date(Date.now() - DAY);
  cert.notAfter.value = input.notAfter ?? new Date(Date.now() + 365 * DAY);

  const basicConstraints = new pkijs.BasicConstraints({ cA: input.ca === true });
  const keyUsage = input.ca
    ? new asn1js.BitString({ valueHex: new Uint8Array([0x84]).buffer, unusedBits: 2 })
    : new asn1js.BitString({ valueHex: new Uint8Array([0x80]).buffer, unusedBits: 7 });
  cert.extensions = [
    new pkijs.Extension({
      extnID: OID.basicConstraints,
      critical: true,
      extnValue: basicConstraints.toSchema().toBER(false),
      parsedValue: basicConstraints,
    }),
    new pkijs.Extension({ extnID: OID.keyUsage, critical: true, extnValue: keyUsage.toBER(false) }),
  ];
  if (input.purposes) {
    const extendedKeyUsage = new pkijs.ExtKeyUsage({ keyPurposes: input.purposes });
    cert.extensions.push(
      new pkijs.Extension({
        extnID: OID.extendedKeyUsage,
        critical: input.purposesCritical !== false,
        extnValue: extendedKeyUsage.toSchema().toBER(false),
        parsedValue: extendedKeyUsage,
      }),
    );
  }
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(input.issuer?.keys.privateKey ?? keys.privateKey, 'SHA-256');
  const certificate = new Uint8Array(cert.toSchema(true).toBER(false));
  return {
    certificate,
    keys,
    signer: webCryptoSigner({
      privateKey: keys.privateKey,
      certificateChain: [certificate, ...(input.issuer?.signer.certificateChain ?? [])],
    }),
  };
}

/** A certificate authority: self-signed, or issued by another one. */
export function createAuthorityRoot(
  commonName: string,
  issuer?: TestIdentity,
  validity: { notBefore?: Date; notAfter?: Date } = {},
) {
  return createIdentity({ commonName, issuer, ca: true, ...validity });
}

/** A timestamp authority's certificate: timestamping is its only purpose, marked critical. */
export function createTimestampAuthorityIdentity(
  commonName: string,
  issuer?: TestIdentity,
  validity: { notBefore?: Date; notAfter?: Date } = {},
) {
  return createIdentity({ commonName, issuer, purposes: [OID.timeStamping], ...validity });
}

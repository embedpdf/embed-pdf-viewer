import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import { ensureEngine } from '../cms/engine';
import { OID, WEBCRYPTO_HASH } from '../cms/oids';

/**
 * A self-signed certificate over a WebCrypto key pair: the shape a personal
 * signer, a test signer, and a demo all need. It is its own trust anchor and
 * nothing else's — Acrobat shows a signature made with it as "validity
 * unknown" until the reader trusts the certificate explicitly.
 */
export async function selfSignedCertificate(input: {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  commonName: string;
  hash: 'sha256' | 'sha384' | 'sha512';
  /** Validity in days; default one year. */
  validityDays?: number;
}): Promise<Uint8Array> {
  ensureEngine();
  const cert = new pkijs.Certificate();
  cert.version = 2;
  const serial = new Uint8Array(8);
  globalThis.crypto.getRandomValues(serial);
  serial[0] &= 0x7f;
  cert.serialNumber = new asn1js.Integer({ valueHex: serial.buffer });
  const name = new pkijs.AttributeTypeAndValue({
    type: OID.commonName,
    value: new asn1js.Utf8String({ value: input.commonName }),
  });
  cert.issuer.typesAndValues.push(name);
  cert.subject.typesAndValues.push(name);
  const now = Date.now();
  cert.notBefore.value = new Date(now - 24 * 3600 * 1000);
  cert.notAfter.value = new Date(now + (input.validityDays ?? 365) * 24 * 3600 * 1000);
  const basicConstraints = new pkijs.BasicConstraints({ cA: true });
  // digitalSignature (bit 0) | keyCertSign (bit 5)
  const keyUsage = new asn1js.BitString({ valueHex: new Uint8Array([0x84]).buffer, unusedBits: 2 });
  cert.extensions = [
    new pkijs.Extension({
      extnID: OID.basicConstraints,
      critical: true,
      extnValue: basicConstraints.toSchema().toBER(false),
      parsedValue: basicConstraints,
    }),
    new pkijs.Extension({ extnID: OID.keyUsage, critical: true, extnValue: keyUsage.toBER(false) }),
  ];
  await cert.subjectPublicKeyInfo.importKey(input.publicKey);
  await cert.sign(input.privateKey, WEBCRYPTO_HASH[input.hash]);
  return new Uint8Array(cert.toSchema(true).toBER(false));
}

/** The subject common name of a DER certificate, or null when it has none. */
export function certificateCommonName(der: Uint8Array): string | null {
  ensureEngine();
  const copy = new Uint8Array(der.byteLength);
  copy.set(der);
  const cert = pkijs.Certificate.fromBER(copy.buffer);
  const cn = cert.subject.typesAndValues.find((entry) => entry.type === OID.commonName);
  const value = cn?.value as { valueBlock?: { value?: unknown } } | undefined;
  const text = value?.valueBlock?.value;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

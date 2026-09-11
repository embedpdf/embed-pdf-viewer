import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import type { RawSigner, RawSignatureAlgorithm } from '../cms/build';
import { ensureEngine } from '../cms/engine';
import { OID, WEBCRYPTO_HASH } from '../cms/oids';

/**
 * A `RawSigner` over a WebCrypto private key: the key never leaves the
 * runtime. The algorithm and hash come from the key itself.
 */
export function webCryptoSigner(input: {
  privateKey: CryptoKey;
  certificateChain: Uint8Array[];
  /** Required for ECDSA keys (the key carries no hash); ignored for RSA keys. */
  hash?: Exclude<DigestAlgorithm, 'sha1'>;
}): RawSigner {
  const keyAlgorithm = input.privateKey.algorithm as RsaHashedKeyAlgorithm | EcKeyAlgorithm;
  let algorithm: RawSignatureAlgorithm;
  let hash: Exclude<DigestAlgorithm, 'sha1'>;
  switch (keyAlgorithm.name) {
    case 'RSASSA-PKCS1-v1_5':
      algorithm = 'RSA-PKCS1-v1_5';
      hash = hashFromWebCrypto((keyAlgorithm as RsaHashedKeyAlgorithm).hash.name);
      break;
    case 'RSA-PSS':
      algorithm = 'RSA-PSS';
      hash = hashFromWebCrypto((keyAlgorithm as RsaHashedKeyAlgorithm).hash.name);
      break;
    case 'ECDSA':
      algorithm = 'ECDSA';
      hash = input.hash ?? 'sha256';
      break;
    default:
      throw new Error(`unsupported WebCrypto key algorithm ${keyAlgorithm.name}`);
  }
  return {
    kind: 'raw',
    certificateChain: input.certificateChain,
    algorithm,
    hash,
    async sign(data) {
      const params: AlgorithmIdentifier | RsaPssParams | EcdsaParams =
        algorithm === 'RSA-PSS'
          ? { name: 'RSA-PSS', saltLength: { sha256: 32, sha384: 48, sha512: 64 }[hash] }
          : algorithm === 'ECDSA'
            ? { name: 'ECDSA', hash: WEBCRYPTO_HASH[hash] }
            : { name: 'RSASSA-PKCS1-v1_5' };
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      const signature = await globalThis.crypto.subtle.sign(params, input.privateKey, copy);
      return new Uint8Array(signature);
    },
  };
}

function hashFromWebCrypto(name: string): Exclude<DigestAlgorithm, 'sha1'> {
  switch (name) {
    case 'SHA-256':
      return 'sha256';
    case 'SHA-384':
      return 'sha384';
    case 'SHA-512':
      return 'sha512';
    default:
      throw new Error(`unsupported key hash ${name}`);
  }
}

export interface TestSigner extends RawSigner {
  /** DER of the self-signed certificate — also the only trust anchor that validates it. */
  readonly certificate: Uint8Array;
  readonly privateKey: CryptoKey;
}

/**
 * A throwaway signer for tests and demos: a fresh key pair and a
 * self-signed certificate, never persisted. Trust it with
 * `{ anchors: async () => [signer.certificate] }`.
 */
export async function createTestSigner(
  opts: { commonName?: string; algorithm?: 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA'; hash?: 'sha256' | 'sha384' | 'sha512' } = {},
): Promise<TestSigner> {
  ensureEngine();
  const subtle = globalThis.crypto.subtle;
  const hash = opts.hash ?? 'sha256';
  const algorithm = opts.algorithm ?? 'RSA-PKCS1-v1_5';
  const keys = (await subtle.generateKey(
    algorithm === 'ECDSA'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : {
          name: algorithm === 'RSA-PSS' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: WEBCRYPTO_HASH[hash],
        },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const cert = new pkijs.Certificate();
  cert.version = 2;
  const serial = new Uint8Array(8);
  globalThis.crypto.getRandomValues(serial);
  serial[0] &= 0x7f;
  cert.serialNumber = new asn1js.Integer({ valueHex: serial.buffer });
  const name = new pkijs.AttributeTypeAndValue({
    type: OID.commonName,
    value: new asn1js.Utf8String({ value: opts.commonName ?? 'EmbedPDF test signer' }),
  });
  cert.issuer.typesAndValues.push(name);
  cert.subject.typesAndValues.push(name);
  const now = Date.now();
  cert.notBefore.value = new Date(now - 24 * 3600 * 1000);
  cert.notAfter.value = new Date(now + 365 * 24 * 3600 * 1000);
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
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, WEBCRYPTO_HASH[hash]);
  const certificate = new Uint8Array(cert.toSchema(true).toBER(false));
  const signer = webCryptoSigner({ privateKey: keys.privateKey, certificateChain: [certificate], hash });
  return { ...signer, certificate, privateKey: keys.privateKey };
}

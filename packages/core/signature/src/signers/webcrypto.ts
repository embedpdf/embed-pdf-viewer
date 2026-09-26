import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';
import type { RawSigner, RawSignatureAlgorithm } from '../cms/build';
import { ensureEngine } from '../cms/engine';
import { buildTimestampToken } from '../cms/timestamp';
import type { CmsSigner } from '../sign';
import { WEBCRYPTO_HASH } from '../cms/oids';
import { selfSignedCertificate } from './self-signed';

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
  options: {
    commonName?: string;
    algorithm?: 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA';
    hash?: 'sha256' | 'sha384' | 'sha512';
  } = {},
): Promise<TestSigner> {
  ensureEngine();
  const hash = options.hash ?? 'sha256';
  const keys = await generateSigningKeyPair(options.algorithm ?? 'RSA-PKCS1-v1_5', hash, true);
  const certificate = await selfSignedCertificate({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    commonName: options.commonName ?? 'EmbedPDF test signer',
    hash,
  });
  const signer = webCryptoSigner({
    privateKey: keys.privateKey,
    certificateChain: [certificate],
    hash,
  });
  return { ...signer, certificate, privateKey: keys.privateKey };
}

export interface TestTimestampAuthority extends CmsSigner {
  /** DER of the authority's self-signed certificate. */
  readonly certificate: Uint8Array;
}

/**
 * A throwaway RFC 3161 timestamp authority for tests and demos: it stamps
 * whatever digest it is given with the current time, signed by a fresh
 * self-signed key. The key for `sign(doc, { kind: 'timestamp', key })`;
 * never use it to stamp a real document.
 */
export async function createTestTimestampAuthority(
  options: { commonName?: string } = {},
): Promise<TestTimestampAuthority> {
  const authority = await createTestSigner({
    commonName: options.commonName ?? 'EmbedPDF test timestamp authority',
  });
  return {
    kind: 'cms',
    certificate: authority.certificate,
    sign: ({ digest, algorithm }) => buildTimestampToken({ digest, hash: algorithm, authority }),
  };
}

/** A WebCrypto signing key pair; `extractable: false` keeps the private key inside the runtime for good. */
export async function generateSigningKeyPair(
  algorithm: 'RSA-PKCS1-v1_5' | 'RSA-PSS' | 'ECDSA',
  hash: 'sha256' | 'sha384' | 'sha512',
  extractable: boolean,
): Promise<CryptoKeyPair> {
  return (await globalThis.crypto.subtle.generateKey(
    algorithm === 'ECDSA'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : {
          name: algorithm === 'RSA-PSS' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: WEBCRYPTO_HASH[hash],
        },
    extractable,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

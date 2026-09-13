import type { DigestAlgorithm } from '@embedpdf/engine-core/runtime';

export const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  timestampToken: '1.2.840.113549.1.9.16.2.14',
  sha1: '1.3.14.3.2.26',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha384: '2.16.840.1.101.3.4.2.2',
  sha512: '2.16.840.1.101.3.4.2.3',
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256WithRsa: '1.2.840.113549.1.1.11',
  sha384WithRsa: '1.2.840.113549.1.1.12',
  sha512WithRsa: '1.2.840.113549.1.1.13',
  rsaPss: '1.2.840.113549.1.1.10',
  mgf1: '1.2.840.113549.1.1.8',
  ecdsaSha256: '1.2.840.10045.4.3.2',
  ecdsaSha384: '1.2.840.10045.4.3.3',
  ecdsaSha512: '1.2.840.10045.4.3.4',
  subjectKeyIdentifier: '2.5.29.14',
  keyUsage: '2.5.29.15',
  basicConstraints: '2.5.29.19',
  commonName: '2.5.4.3',
} as const;

export const DIGEST_BY_OID: Record<string, DigestAlgorithm> = {
  [OID.sha1]: 'sha1',
  [OID.sha256]: 'sha256',
  [OID.sha384]: 'sha384',
  [OID.sha512]: 'sha512',
};

export const OID_BY_DIGEST: Record<DigestAlgorithm, string> = {
  sha1: OID.sha1,
  sha256: OID.sha256,
  sha384: OID.sha384,
  sha512: OID.sha512,
};

/** WebCrypto hash names. */
export const WEBCRYPTO_HASH: Record<DigestAlgorithm, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

export const DIGEST_LENGTH: Record<DigestAlgorithm, number> = {
  sha1: 20,
  sha256: 32,
  sha384: 48,
  sha512: 64,
};

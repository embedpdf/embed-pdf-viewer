/// <reference lib="dom" />
// The signer ports speak WebCrypto (`CryptoKey`, `SubtleCrypto`) and the
// personal key store IndexedDB: type-only globals, pulled in here so a
// consumer compiling this package from source needs no DOM lib of its own.
export type { ParsedCms } from './cms/parse';
export { CmsError, parseDetachedCms } from './cms/parse';
export { verifyCmsSignature, type CryptographyVerdict } from './cms/verify';
export {
  buildDetachedCms,
  type BuildDetachedCmsInput,
  type RawSignatureAlgorithm,
  type RawSigner,
  type SignatureProfile,
} from './cms/build';
export {
  verifyForCompletion,
  type CompletionGate,
  type CompletionProfile,
  type CompletionRefusal,
} from './gate';
export {
  validateChain,
  type TrustPort,
  type TrustStatus,
  type TrustVerdict,
  type ValidationTime,
} from './trust';
export { sign, profileFor, type CmsSigner, type SignInput, type SignerPort } from './sign';
export {
  validateSignatures,
  type IntegrityVerdict,
  type ModificationsVerdict,
  type SignatureVerdict,
  type ValidateSignaturesOptions,
} from './verdict';
export {
  createTestSigner,
  createTestTimestampAuthority,
  generateSigningKeyPair,
  webCryptoSigner,
  type TestSigner,
  type TestTimestampAuthority,
} from './signers/webcrypto';
export { remoteSigner } from './signers/remote';
export {
  indexedDbKeyStore,
  memoryKeyStore,
  personalSigner,
  type PersonalKeyRecord,
  type PersonalKeyStore,
  type PersonalSigner,
} from './signers/personal';
export { certificateCommonName, selfSignedCertificate } from './signers/self-signed';

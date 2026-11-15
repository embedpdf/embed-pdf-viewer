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
  type AppliedValidationTime,
  type TrustPort,
  type TrustStatus,
  type TrustVerdict,
  type ValidationTime,
} from './trust';
export {
  completeSignature,
  sign,
  profileFor,
  type CmsSigner,
  type SignInput,
  type SignerPort,
} from './sign';
export { attachSignatureTimestamp } from './cms/attach';
export {
  validateSignatures,
  verifyTimestampToken,
  type IntegrityVerdict,
  type ModificationsVerdict,
  type SignatureVerdict,
  type TimestampVerdict,
  type ValidateSignaturesOptions,
} from './verdict';
export type {
  LongTermGap,
  LongTermGapReason,
  LongTermVerdict,
  RevocationVerdict,
} from './long-term';
export {
  createTestSigner,
  createTestTimestampAuthority,
  generateSigningKeyPair,
  webCryptoSigner,
  type TestSigner,
  type TestTimestampAuthority,
} from './signers/webcrypto';
export { remoteSigner } from './signers/remote';
export { ecdsaRawFromDer } from './signers/ecdsa';
export {
  httpTimestampAuthority,
  type HttpTimestampAuthorityOptions,
} from './signers/timestamp-http';
export {
  indexedDbKeyStore,
  memoryKeyStore,
  personalSigner,
  type PersonalKeyRecord,
  type PersonalKeyStore,
  type PersonalSigner,
} from './signers/personal';
export { certificateCommonName, selfSignedCertificate } from './signers/self-signed';
export {
  createTestCertificateAuthority,
  type TestCertificateAuthority,
  type Unrevocable,
} from './signers/test-authority';
export type { RevocationReason } from './revocation/answer';
export type { RevocationRequest, RevocationSource } from './revocation/source';
export {
  httpRevocationSource,
  type HttpRevocationSourceOptions,
  type RevocationRouteRequest,
} from './revocation/http-source';
export {
  addValidationInfo,
  type AddValidationInfoOptions,
  type AddValidationInfoResult,
} from './collect';

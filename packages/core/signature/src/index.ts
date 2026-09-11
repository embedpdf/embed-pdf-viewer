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
export { verifyForCompletion, type CompletionGate, type CompletionRefusal } from './gate';
export { validateChain, type TrustPort, type TrustStatus, type TrustVerdict, type ValidationTime } from './trust';
export { sign, SigningError, profileFor, type CmsSigner, type SignInput, type SignerPort } from './sign';
export {
  validateSignatures,
  type IntegrityVerdict,
  type ModificationsVerdict,
  type SignatureVerdict,
  type ValidateSignaturesOptions,
} from './verdict';
export { createTestSigner, webCryptoSigner, type TestSigner } from './signers/webcrypto';

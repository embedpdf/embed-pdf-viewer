export { signaturePlugin } from './signature.plugin';
export { signatureState, type SignatureState } from './state';
export * from './contract';
// The signer ports and the sources a config names, re-exported so a viewer configures signing
// from one import.
export {
  createTestCertificateAuthority,
  createTestSigner,
  createTestTimestampAuthority,
  httpRevocationSource,
  httpTimestampAuthority,
  indexedDbKeyStore,
  memoryKeyStore,
  personalSigner,
  remoteSigner,
  webCryptoSigner,
} from '@embedpdf/core-signature';
export type {
  PersonalKeyStore,
  PersonalSigner,
  TestCertificateAuthority,
  TestSigner,
  TestTimestampAuthority,
} from '@embedpdf/core-signature';

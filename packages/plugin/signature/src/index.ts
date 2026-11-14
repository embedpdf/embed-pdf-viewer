export { signaturePlugin } from './signature.plugin';
export { signatureState, type SignatureState } from './state';
export * from './contract';
// The signer ports, re-exported so a viewer configures signing from one import.
export {
  createTestSigner,
  createTestTimestampAuthority,
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
  TestSigner,
  TestTimestampAuthority,
} from '@embedpdf/core-signature';

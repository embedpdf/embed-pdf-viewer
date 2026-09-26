export { signaturePlugin } from './signature.plugin';
export * from './contract';
// The signer ports, re-exported so a viewer configures signing from one import.
export {
  createTestSigner,
  indexedDbKeyStore,
  memoryKeyStore,
  personalSigner,
  remoteSigner,
  webCryptoSigner,
} from '@embedpdf/core-signature';
export type { PersonalKeyStore, PersonalSigner, TestSigner } from '@embedpdf/core-signature';

/**
 * @embedpdf/angular/signature: sign PDF signature fields with a mark and a key you control,
 * check the signatures a document has, and hear before an edit breaks one.
 *
 *   withSignature(config)      the plugin, for provideEmbedPdf(), with the key to sign with
 *   inject(EpdfSignature)      signing, filling and checking, as signals, methods and streams;
 *                              `signerRows()`, the people whose marks this browser holds
 *
 * The signers (`webCryptoSigner`, `remoteSigner`, `personalSigner` with `indexedDbKeyStore`,
 * `createTestSigner`) come with the plugin's exports below.
 */

// The plugin's types, helpers and signers, so app code has one import for the feature.
export * from '@embedpdf/plugin-signature';
export { EpdfSignature, withSignature } from './signature';

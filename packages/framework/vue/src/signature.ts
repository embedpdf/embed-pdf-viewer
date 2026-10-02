/**
 * @embedpdf/vue/signature: the Vue surface of `@embedpdf/plugin-signature`.
 *
 * Signing for the document in scope (`useSignature()`), its state as refs (the
 * signatures with their verdicts, what they allow, the target, a two-step
 * signing in progress), the settings, the events, and the one derivation a
 * signatures panel needs: the people (libraries of kind `signatures`) with
 * their marks (`useSignerRows()`). The signers (`personalSigner`,
 * `webCryptoSigner`, `remoteSigner`, `createTestSigner`) come with the plugin.
 *
 *   const signature = useSignature();
 *   await signature.placeMark({ assetId }, { field: target }); // sign, fill or ask, by mode
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-signature';
export {
  useSignature,
  useSignatureEvent,
  useSignatureSettings,
  useSignatureState,
  useSignerRows,
} from './signature/composables';

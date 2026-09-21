/** @embedpdf/plugin-signature/internal — framework/host helpers; not for application code. */
export * from './host-contract';
export { createSignatureCapability, createSignatureController } from './controller';
export { createArmedMarkHandler } from './tools/armed-mark';
export { initialSignatureState, signatureReducer } from './model';

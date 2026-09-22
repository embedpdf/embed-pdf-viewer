/** @embedpdf/plugin-signature/contract/host — same runtime token; the host lens equals the public one today. */
import type { SignatureCapability } from './contract';

export * from './contract';
export { SignatureToken } from './token';
export type { SignatureAction, SignatureState } from './model';

export type SignatureHostCapability = SignatureCapability;

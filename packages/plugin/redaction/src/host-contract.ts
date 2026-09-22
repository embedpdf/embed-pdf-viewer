/** @embedpdf/plugin-redaction/contract/host — same runtime token; the host lens equals the public one today. */
import type { RedactionCapability } from './contract';

export * from './contract';
export { RedactionToken } from './token';
export type { RedactionAction, RedactionState } from './model';

export type RedactionHostCapability = RedactionCapability;

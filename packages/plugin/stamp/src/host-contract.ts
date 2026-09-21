/** @embedpdf/plugin-stamp/contract/host — same runtime token; the host lens equals the public one today. */
import type { StampCapability } from './contract';

export * from './contract';
export { StampToken } from './token';
export type { StampAction, StampState } from './model';

export type StampHostCapability = StampCapability;

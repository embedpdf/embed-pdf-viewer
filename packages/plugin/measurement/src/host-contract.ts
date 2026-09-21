/** @embedpdf/plugin-measurement/contract/host — same runtime token; the host lens equals the public one today. */
import type { MeasurementCapability } from './contract';

export * from './contract';
export { MeasurementToken } from './token';
export type { MeasurementAction, MeasurementState } from './model';

export type MeasurementHostCapability = MeasurementCapability;

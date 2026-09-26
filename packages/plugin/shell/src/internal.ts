/** @embedpdf/plugin-shell/internal — framework/host helpers; not for application code. */
export * from './host-contract';
export { createShellController } from './controller';
export { initialShellState, shellReducer } from './model';
export type { SurfaceRecord } from './model';

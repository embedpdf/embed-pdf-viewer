/** @embedpdf/plugin-shell/contract/host — same runtime token; the host lens equals the public one today. */
import type { ShellCapability } from './contract';

export * from './contract';
export { ShellToken } from './token';
export type { ShellAction, ShellState } from './model';

export type ShellHostCapability = ShellCapability;

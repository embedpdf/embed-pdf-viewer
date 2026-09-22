/** @embedpdf/plugin-view-manager/contract/host — same runtime token; the host lens equals the public one today. */
import type { ViewManagerCapability } from './contract';

export * from './contract';
export { ViewManagerToken } from './token';
export type { Pane, ViewManagerAction, ViewManagerState } from './model';

export type ViewManagerHostCapability = ViewManagerCapability;

/** @embedpdf/plugin-page-edit/contract/host — same runtime token; the host lens equals the public one today. */
import type { PageEditCapability } from './contract';

export * from './contract';
export { PageEditToken } from './token';

export type PageEditHostCapability = PageEditCapability;

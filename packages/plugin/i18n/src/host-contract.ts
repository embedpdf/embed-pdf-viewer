/** @embedpdf/plugin-i18n/contract/host — same runtime token; the host lens equals the public one today. */
import type { I18nCapability } from './contract';

export * from './contract';
export { I18nToken } from './token';
export type { I18nAction, I18nState } from './model';

export type I18nHostCapability = I18nCapability;

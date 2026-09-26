/**
 * @embedpdf/plugin-stage — the coordinate core, as a kernel plugin.
 *
 * In v2 these were five fighting plugins (viewport, scroll, zoom, pan, spread).
 * Here they are one Camera + Scene + flat settings — `contract.ts` · `model.ts` ·
 * `controller.ts` (services / read / camera / navigation / settings / view) · `stage.plugin.ts`.
 */
export { stagePlugin } from './stage.plugin';
export type { StagePluginOptions } from './stage.plugin';
export * from './contract';
export { destinationToReveal } from './destination';
export type { DestinationReveal } from './destination';
export { createScrollHandler } from './scroll-handler';
export type { ScrollHandlerOptions } from './scroll-handler';
export { DEFAULT_SETTINGS, DEFAULT_RESPONSIVE, settingsEqual } from './settings';
export { boxOf, matchesQuery, resolveResponsive } from './responsive';

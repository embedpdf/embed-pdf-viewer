/**
 * @embedpdf/plugin-stage — the coordinate core, as a kernel plugin.
 *
 * In v2 these were five fighting plugins (viewport, scroll, zoom, pan, spread).
 * Here they are one Camera + Scene + flat settings. See the standard plugin layout:
 *   types.ts · settings.ts · reducer.ts · capability.ts · stage.plugin.ts
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

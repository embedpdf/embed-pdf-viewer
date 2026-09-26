/**
 * @embedpdf/plugin-stage: the coordinate core as a kernel plugin. One camera,
 * one scene and a flat settings bag cover viewport, scroll, zoom, pan and
 * spread. `contract.ts` · `model.ts` · `controller.ts` (services, read,
 * camera, navigation, settings, view) · `connect.ts` · `stage.plugin.ts`.
 */
export { stagePlugin } from './stage.plugin';
export * from './contract';
export { destinationToReveal } from './destination';
export type { DestinationReveal } from './destination';
export { createScrollHandler } from './scroll-handler';
export type { ScrollHandlerOptions } from './scroll-handler';
export { DEFAULT_SETTINGS, DEFAULT_RESPONSIVE, settingsEqual } from './settings';
export { boxOf, matchesQuery, resolveResponsive } from './responsive';

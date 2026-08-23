/**
 * @embedpdf/plugin-stage — the coordinate core, as a kernel plugin.
 *
 * In v2 these were five fighting plugins (viewport, scroll, zoom, pan, spread).
 * Here they are one Camera + Scene + flat settings. See the standard plugin layout:
 *   types.ts · settings.ts · reducer.ts · capability.ts · stage.plugin.ts
 */
export { stagePlugin } from './stage.plugin';
export type { StagePluginOptions } from './stage.plugin';
export { StageToken } from './types';
export { destinationToReveal } from './destination';
export type { DestinationReveal } from './destination';
export { wheelZoomFactor } from './wheel';
export type { WheelSample } from './wheel';
export { DEFAULT_SETTINGS, DEFAULT_RESPONSIVE, settingsEqual } from './settings';
export { boxOf, matchesQuery, resolveResponsive } from './responsive';
export type {
  BoxQuery,
  FlowMode,
  Gap,
  GridColumns,
  LayoutKind,
  ScrollBehaviorKind,
  GoToOptions,
  RevealAnchor,
  RevealAnchorValue,
  ResponsiveRule,
  RevealOptions,
  RevealZoom,
  StageBox,
  StageScrollToOptions,
  StageSettings,
  StageState,
  StageAction,
  StageViewState,
  StageCapability,
  StageConfig,
  Scheduler,
  Viewpoint,
  VisiblePage,
} from './types';
// Re-export the view-vocabulary the shell needs (spread modes, sizing, zoom, …).
export { ZoomMode } from '@embedpdf/core-stage';
export type {
  Align,
  Alignment,
  Direction,
  PageFrame,
  ScrollMetrics,
  SpreadMode,
  SizingMode,
  ZoomModeValue,
  ZoomSpec,
} from '@embedpdf/core-stage';

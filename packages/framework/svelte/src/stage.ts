/**
 * @embedpdf/svelte/stage — the Stage and its readers.
 *
 * `<Stage>` lays out and positions the visible pages by the camera, and hands each one to its
 * content: you bring the layers. The readers are the plugin's four, `useStage()` (the API),
 * `useStageState()`, `useStageSettings()` and `useStageEvent()`; `<Scrollbar>` and
 * `useScrollMetrics()` are the Stage's too.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-stage';

export { default as Stage } from './stage/Stage.svelte';
export { default as StageScope } from './stage/StageScope.svelte';
export { default as Scrollbar } from './stage/Scrollbar.svelte';
export type { ScrollbarAxis, ScrollbarProps, StageProps } from './stage/props';
export { useStageToken } from './stage/stage-scope';
export type { StageTokenProp } from './stage/stage-scope';
export {
  useScrollMetrics,
  useStage,
  useStageEvent,
  useStageSettings,
  useStageState,
} from './stage/readers.svelte';
export type { StageStateValue } from './stage/readers.svelte';

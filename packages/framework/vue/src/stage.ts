/**
 * @embedpdf/vue/stage: the Stage and its composables.
 *
 * `<Stage>` virtualizes and positions page surfaces by the camera, and hands
 * each one to your `#page` slot: you bring the layers. The composables are the
 * plugin's four, `useStage()` (the API), `useStageState()`, `useStageEvent()`
 * and `useStageSettings()`; `<Scrollbar>` and `useScrollMetrics()` are the
 * Stage's too.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-stage';
export { default as Stage } from './stage/Stage.vue';
export { default as StageScope } from './stage/StageScope.vue';
export { default as Scrollbar } from './stage/Scrollbar.vue';
export { useStageToken } from './stage/scope';
export type { StageTokenProp } from './stage/scope';
export {
  useScrollMetrics,
  useStage,
  useStageEvent,
  useStageSettings,
  useStageState,
} from './stage/composables';
export type { StageStateValue, StageTokenSource } from './stage/composables';

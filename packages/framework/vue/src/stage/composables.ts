/**
 * The Stage's composables: `useStage()` (the API), `useStageState()`,
 * `useStageEvent()`, `useStageSettings()`, and `useScrollMetrics()` for scroll
 * UI of your own. Each takes an optional token after its other arguments;
 * without one it binds to the nearest `<StageScope>` / `<Stage>`, else the
 * main view.
 */
import { shallowEqual } from '@embedpdf/core';
import type { CapabilityToken, EventHook } from '@embedpdf/core';
import { DEFAULT_SETTINGS, stageState } from '@embedpdf/plugin-stage';
import type { StageCapability, StageSettings } from '@embedpdf/plugin-stage';
import type { ScrollMetrics, StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { useCapability, useCapabilityEvent } from '../runtime/capabilities';
import { useDocumentScope, useKernelValue } from '../runtime/kernel';
import { fieldRefs } from '../runtime/refs';
import type { FieldRefs } from '../runtime/refs';
import { useStageToken } from './scope';
import type { StageTokenProp } from './scope';

/** A stage token, or a ref or getter of one: for a view chosen by a prop. */
export type StageTokenSource = MaybeRefOrGetter<StageTokenProp | undefined>;

/** What `useStageState()` reads: the Stage page's State table. */
export type StageStateValue = (typeof stageState)['empty'];

/** The Stage's API (zoom, navigation, reveal, settings), for app chrome. The object never changes. */
export function useStage(token?: StageTokenSource): StageCapability {
  return useCapability(useStageToken(token));
}

/** Subscribe to one stage event while the component lives: `useStageEvent((stage) => stage.onZoomChanged, handler)`. */
export function useStageEvent<Event>(
  select: (stage: StageCapability) => EventHook<Event>,
  handler: (event: Event) => void,
  token?: StageTokenSource,
): void {
  useCapabilityEvent(useStageToken(token), select, handler);
}

/**
 * The view's state as refs: the zoom, the current page, the page count, the
 * view rotation and the responsive rules that apply (the page's State table,
 * declared once in `stageState`). With a selector, one ref for the value it
 * picks, which updates only when that value changes. Without a document it
 * reads `stageState.empty`.
 */
export function useStageState(
  select?: undefined,
  token?: StageTokenSource,
): FieldRefs<StageStateValue>;
export function useStageState<Selected>(
  select: (state: StageStateValue) => Selected,
  token?: StageTokenSource,
): Readonly<Ref<Selected>>;
export function useStageState<Selected>(
  select?: (state: StageStateValue) => Selected,
  token?: StageTokenSource,
) {
  const lens = useStageToken(token);
  const scope = useDocumentScope();
  // Resolved on every read: a document that closes reads as `empty`, never
  // through its closed capability.
  const value = useKernelValue((kernel) => {
    const stage = kernel.tryCapability(lens.value, scope.value ?? undefined);
    const state = stage ? stageState.read(stage) : stageState.empty;
    return select ? select(state) : state;
  }, shallowEqual);
  return select
    ? value
    : fieldRefs(value as Readonly<Ref<StageStateValue>>, Object.keys(stageState.empty));
}

/**
 * The view's settings as refs, or one ref for the value `select` picks. They
 * belong to the view, so without a document there is none yet and this reads
 * the defaults. Change them with `useStage().updateSettings()`.
 */
export function useStageSettings(
  select?: undefined,
  token?: StageTokenSource,
): FieldRefs<StageSettings>;
export function useStageSettings<Selected>(
  select: (settings: StageSettings) => Selected,
  token?: StageTokenSource,
): Readonly<Ref<Selected>>;
export function useStageSettings<Selected>(
  select?: (settings: StageSettings) => Selected,
  token?: StageTokenSource,
) {
  const lens = useStageToken(token);
  const scope = useDocumentScope();
  const value = useKernelValue((kernel) => {
    const settings =
      kernel.tryCapability(lens.value, scope.value ?? undefined)?.getSettings() ??
      DEFAULT_SETTINGS;
    return select ? select(settings) : settings;
  }, shallowEqual);
  return select
    ? value
    : fieldRefs(value as Readonly<Ref<StageSettings>>, Object.keys(DEFAULT_SETTINGS));
}

/** What a view with nothing to scroll measures: no document, or not placed yet. */
const NO_SCROLL: ScrollMetrics = Object.freeze({
  scrollLeft: 0,
  scrollTop: 0,
  scrollWidth: 0,
  scrollHeight: 0,
  clientWidth: 0,
  clientHeight: 0,
  scrollableX: false,
  scrollableY: false,
});

// Scroll metrics live on the host lens (the same runtime token, typed wider):
// a scrollbar is chrome that drives the camera, not a document-level consumer.
export const asHost = (token: CapabilityToken<StageCapability>) =>
  token as unknown as CapabilityToken<StageHostCapability>;

/** The metrics of a lens, as one ref: for the `<Scrollbar>` and the field refs below. */
export function useScrollMetricsValue(token?: StageTokenSource): Readonly<Ref<ScrollMetrics>> {
  const lens = useStageToken(token);
  const scope = useDocumentScope();
  // The capability keeps the same metrics object until a number moves.
  return useKernelValue(
    (kernel) =>
      kernel.tryCapability(asHost(lens.value), scope.value ?? undefined)?.getScrollMetrics() ??
      NO_SCROLL,
  );
}

/**
 * The view's scroll position as a scrolling element has it, as refs:
 * `scrollTop`, `scrollHeight`, `clientHeight` and their horizontal twins, in
 * screen pixels. The raw material for scroll UI of your own; all zero without
 * a document.
 */
export function useScrollMetrics(token?: StageTokenSource): FieldRefs<ScrollMetrics> {
  return fieldRefs(useScrollMetricsValue(token), Object.keys(NO_SCROLL));
}

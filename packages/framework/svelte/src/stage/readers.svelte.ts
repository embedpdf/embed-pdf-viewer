/**
 * The Stage's readers: `useStage()` (the API), `useStageState()`, `useStageSettings()`,
 * `useStageEvent()` and `useScrollMetrics()`. Each takes an optional token; without one it binds
 * to the nearest `<StageScope>` / `<Stage>`, else the main view. A token that changes (a prop) is
 * passed as a function: `useStage(() => token)`, and after a selector,
 * `useStageState((state) => state.zoomLevel, () => token)`.
 */
import { shallowEqual } from '@embedpdf/core';
import type { CapabilityToken, EventHook } from '@embedpdf/core';
import { DEFAULT_SETTINGS, stageState } from '@embedpdf/plugin-stage';
import type { StageCapability, StageSettings } from '@embedpdf/plugin-stage';
import type { ScrollMetrics, StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { documentScopeOf, useKernelBinding } from '../runtime/binding.svelte';
import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { declaredState, readRecord } from '../runtime/state.svelte';
import {
  derivedValue,
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from '../runtime/values.svelte';
import { stageTokenOf, type StageTokenProp } from './stage-scope';

/** What `useStageState()` gives: the Stage page's State table. */
export type StageStateValue = (typeof stageState)['empty'];

/** A lens argument: a token, a function that returns one, or none (the scope's, else the main view). */
type LensArgument = MaybeGetter<StageTokenProp | undefined>;

/** The lens a reader with this argument binds to, read on every use. */
const lensOf = (token: LensArgument) => stageTokenOf(() => valueOf(token));

/** The Stage's API (zoom, navigation, reveal, settings), for app chrome. */
export function useStage(token?: LensArgument): StageCapability {
  return useCapability(lensOf(token));
}

/** Subscribe to one stage event while the component lives: `useStageEvent((stage) => stage.onZoomChanged, handler)`. */
export function useStageEvent<T>(
  select: (stage: StageCapability) => EventHook<T>,
  handler: (event: T) => void,
  token?: LensArgument,
): void {
  useCapabilityEvent(lensOf(token), select, handler);
}

/**
 * A reader's arguments: a selector, then an optional lens; or just a token. A function first is
 * always the selector, so a token that changes goes second, as a function.
 */
function selectorAndLens<Value, Selected>(
  first: ((value: Value) => Selected) | StageTokenProp | undefined,
  second: LensArgument,
): [((value: Value) => Selected) | undefined, LensArgument] {
  return typeof first === 'function' ? [first, second] : [undefined, first ?? second];
}

/**
 * The view's state: the zoom, the current page, the page count, the view rotation and the
 * responsive rules that apply (declared once in `stageState`), as a reactive object
 * (`state.zoomLevel`). With a selector, the value it picks as `{ current }`. Without a document
 * it is `stageState.empty`.
 */
export function useStageState(token?: StageTokenProp): Readonly<StageStateValue>;
export function useStageState<Selected>(
  select: (state: StageStateValue) => Selected,
  token?: LensArgument,
): CurrentValue<Selected>;
export function useStageState<Selected>(
  first?: ((state: StageStateValue) => Selected) | StageTokenProp,
  second?: LensArgument,
) {
  const [select, token] = selectorAndLens(first, second);
  const binding = useKernelBinding();
  const lens = lensOf(token);
  const whole = declaredState(binding, lens, stageState.read, stageState.empty);
  return readRecord(whole, Object.keys(stageState.empty) as (keyof StageStateValue)[], select);
}

/**
 * The view's settings, as a reactive object, or the value a selector picks as `{ current }`. They
 * belong to the view, so without a document there is none yet and this reads the defaults.
 * Change them with `useStage().updateSettings()`.
 */
export function useStageSettings(token?: StageTokenProp): Readonly<StageSettings>;
export function useStageSettings<Selected>(
  select: (settings: StageSettings) => Selected,
  token?: LensArgument,
): CurrentValue<Selected>;
export function useStageSettings<Selected>(
  first?: ((settings: StageSettings) => Selected) | StageTokenProp,
  second?: LensArgument,
) {
  const [select, token] = selectorAndLens(first, second);
  const binding = useKernelBinding();
  const lens = lensOf(token);
  const scoped = documentScopeOf();
  const whole = derivedValue(() => {
    binding.track();
    const stage = binding.kernel.tryCapability(lens(), scoped() ?? undefined);
    return stage?.getSettings() ?? DEFAULT_SETTINGS;
  }, shallowEqual);
  return readRecord(whole, Object.keys(DEFAULT_SETTINGS) as (keyof StageSettings)[], select);
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

// Scroll metrics live on the host lens (the same runtime token, typed wider): a scrollbar is
// chrome that drives the camera, not a document-level consumer.
export const asHost = (token: CapabilityToken<StageCapability>) =>
  token as unknown as CapabilityToken<StageHostCapability>;

/**
 * The view's scroll position as a scrolling element has it: `scrollTop`, `scrollHeight`,
 * `clientHeight` and their horizontal twins, in screen pixels, as a reactive object. The raw
 * material for scroll UI of your own; all zero without a document.
 */
export function useScrollMetrics(token?: LensArgument): Readonly<ScrollMetrics> {
  return scrollMetricsOf(lensOf(token));
}

/** {@link useScrollMetrics} for the lens `lens()` names now, for a component whose token is a prop. */
export function scrollMetricsOf(lens: () => StageTokenProp): Readonly<ScrollMetrics> {
  const binding = useKernelBinding();
  const scoped = documentScopeOf();
  // The capability keeps the same metrics object until a number moves.
  const whole = derivedValue(() => {
    binding.track();
    const stage = binding.kernel.tryCapability(asHost(lens()), scoped() ?? undefined);
    return stage?.getScrollMetrics() ?? NO_SCROLL;
  });
  return readRecord(
    whole,
    Object.keys(NO_SCROLL) as (keyof ScrollMetrics)[],
    undefined,
  ) as Readonly<ScrollMetrics>;
}

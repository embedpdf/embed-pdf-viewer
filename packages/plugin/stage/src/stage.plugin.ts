import { definePlugin } from '@embedpdf/core';
import type { CapabilityToken } from '@embedpdf/core';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { createStageCapability } from './capability';
import { createScrollHandler } from './scroll-handler';
import { registerStageEffects } from './effects';
import { initialStageState, stageReducer } from './reducer';
import { StageToken } from './types';
import type { StageAction, StageCapability, StageConfig, StageState } from './types';

/**
 * Options for registering a stage instance. The Stage is a LENS, not a singleton:
 * a document may be viewed through several stages at once (the main view, a wrapped
 * thumbnail sidebar, …), each with independent camera/settings. Register additional
 * lenses by giving them their own `id` + `token`:
 *
 *   const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
 *   plugins = [
 *     stagePlugin(),                                                   // main lens
 *     stagePlugin({ id: 'stage-thumbs', token: ThumbsToken,
 *                   layout: 'grid', columns: 'auto', zoom: { level: 0.2 } }),
 *   ];
 *
 * Everything multiplexes automatically: state slices, capabilities, and teardown
 * are already keyed by plugin-id × document in the kernel.
 */
export interface StagePluginOptions extends StageConfig {
  id?: string;
  token?: CapabilityToken<StageCapability>;
  /**
   * Opt this lens into the interaction hub: register a tool-gated `scroll`
   * handler (so dragging pans only in `pan` mode). Pair with `<Stage interaction>`
   * on the React side, which forwards pointer events to the hub. Default false —
   * secondary lenses (thumbnails) stay click-to-navigate.
   */
  interaction?: boolean;
  /**
   * When {@link interaction} is on, let drags over page GAPS pan regardless of the
   * active tool (and show a grab cursor there) — the gutter always pans, matching
   * v2 and the intuition that there's nothing to draw/select outside a page.
   * On-page behaviour is untouched. Default true; ignored without `interaction`.
   */
  panFallback?: boolean;
}

/**
 * Wires the parts into a kernel plugin. This file is the "manifest": it says what
 * the plugin IS (id, token, state, reducer, capability) — the how lives in the
 * sibling files.
 */
export const stagePlugin = (options: StagePluginOptions = {}) => {
  const {
    id = 'stage',
    token = StageToken,
    interaction = false,
    panFallback = true,
    ...config
  } = options;
  return definePlugin<StageState, StageAction, StageCapability>({
    id,
    token,
    scope: 'document', // one instance of THIS lens per open document
    // When this lens drives interaction, it contributes the pan-scroll handler to
    // the hub (optional dep — the hub may not be present in a headless setup).
    optional: interaction ? [InteractionToken] : undefined,
    initialState: () => initialStageState(config),
    reduce: stageReducer,
    capability: (ctx) => createStageCapability(ctx, config),
    init: interaction
      ? (ctx) => {
          const ix = ctx.tryGet(InteractionToken);
          if (ix) ix.registerHandler(createScrollHandler(ctx.get(token), ix, { panFallback }));
        }
      : undefined,
    // INITIAL placement is deliberately NOT an effect: it's LEVEL-triggered
    // inside the capability's setViewport (place when the stage first learns a
    // real size), so it cannot race effect registration. Other plugins only
    // *offer* initial views via provideInitialView; placeInitial resolves them
    // by priority. The one effect below is STEADY-STATE — it re-fits when the
    // page registry mutates (rotate/move/delete) and so has no such race.
    effects: (ctx) => registerStageEffects(ctx, token),
  });
};

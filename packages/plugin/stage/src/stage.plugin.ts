import { definePlugin } from '@embedpdf/core';
import type { CapabilityToken } from '@embedpdf/core';
import { ActionsToken as PublicActionsToken } from '@embedpdf/plugin-actions';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/internal';
import { createStageCapability } from './capability';
import { destinationToReveal } from './destination';
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
}

/**
 * Wires the parts into a kernel plugin. This file is the "manifest": it says what
 * the plugin IS (id, token, state, reducer, capability) — the how lives in the
 * sibling files.
 */
export const stagePlugin = (options: StagePluginOptions = {}) => {
  const { id = 'stage', token = StageToken, ...config } = options;
  return definePlugin<StageState, StageAction, StageCapability>({
    id,
    token,
    scope: 'document', // one instance of THIS lens per open document
    optional: [PublicActionsToken],
    initialState: () => initialStageState(config),
    reduce: stageReducer,
    capability: (ctx) => createStageCapability(ctx, config),
    // Interaction opt-in lives with the SAMPLE SOURCE, not here: the surface
    // binding (`<Stage interaction>` / `createStageSurface`) both forwards
    // pointer samples AND registers this lens's scroll handler, lens-scoped —
    // one knob, and a handler can never exist without its input stream.
    // INITIAL placement is deliberately NOT an effect: it's LEVEL-triggered
    // inside the capability's setViewport (place when the stage first learns a
    // real size), so it cannot race effect registration. Other plugins only
    // *offer* initial views via provideInitialView; placeInitial resolves them
    // by priority. The one effect below is STEADY-STATE — it re-fits when the
    // page registry mutates (rotate/move/delete) and so has no such race.
    effects: (ctx) => registerStageEffects(ctx, token, id === 'stage'),
    init: (ctx) => {
      // Navigation executors for the action engine — registered by the
      // DEFAULT lens only (a thumbnail lens must never win the last-wins
      // registry and start navigating the sidebar). Executor bodies resolve
      // the stage capability at CALL time; the dispatcher invokes them as
      // DEFERRED navigation effects, never mid-walk.
      if (id !== 'stage') return;
      const actions = ctx.tryGet(ActionsHostToken);
      if (!actions) return;
      ctx.cleanup(
        actions.registerExecutor('goto', (node) => {
          if (node.type !== 'goto') return { status: 'inert', reason: 'not a goto node' };
          const stage = ctx.tryGet(token);
          const layout = ctx
            .document()
            ?.pages.find((p) => p.pageObjectNumber === node.destination.pageObjectNumber);
          if (!stage || !layout) {
            return { status: 'failed', error: 'no stage or destination page available' };
          }
          const { pageIndex, options: reveal } = destinationToReveal(node.destination, layout);
          stage.reveal(pageIndex, { ...reveal, behavior: 'smooth' });
          return { status: 'executed' };
        }),
      );
      ctx.cleanup(
        actions.registerExecutor('named', (node) => {
          if (node.type !== 'named') return { status: 'inert', reason: 'not a named node' };
          const stage = ctx.tryGet(token);
          if (!stage) return { status: 'failed', error: 'no stage available' };
          // Page verbs only — the dispatcher owns /N Print (policy + adapter).
          switch (node.name) {
            case 'NextPage':
              stage.next({ behavior: 'smooth' });
              return { status: 'executed' };
            case 'PrevPage':
              stage.prev({ behavior: 'smooth' });
              return { status: 'executed' };
            case 'FirstPage':
              stage.goToPage(0, { behavior: 'smooth' });
              return { status: 'executed' };
            case 'LastPage':
              stage.goToPage(Math.max(0, stage.pageCount() - 1), { behavior: 'smooth' });
              return { status: 'executed' };
            default:
              return { status: 'inert', reason: `unknown named action '${node.name}'` };
          }
        }),
      );
    },
  });
};

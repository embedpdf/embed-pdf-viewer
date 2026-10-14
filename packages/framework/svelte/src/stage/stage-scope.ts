/**
 * The stage lens a subtree binds to, so the stage readers and the stage-bound chrome
 * (`<Scrollbar>`, `<SelectionHandles>`) need no token. `<Stage>` provides its own lens to its
 * pages and overlay; an app wraps a second lens (a thumbnail rail) in `<StageScope token>`. An
 * explicit token still wins everywhere.
 *
 * Apart from `./Stage.svelte`, so entries that only need the scope never pull the stage surface.
 */
import { getContext, hasContext, setContext } from 'svelte';
import type { CapabilityToken } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';

/** Which stage lens to bind to: the main `StageToken`, or a second view's own token. */
export type StageTokenProp = CapabilityToken<StageCapability>;

const STAGE_TOKEN = Symbol('embedpdf.stage-token');

/** For `<Stage>` and `<StageScope>`: bind everything inside to the lens `token()` names. */
export function setStageToken(token: () => StageTokenProp): void {
  setContext(STAGE_TOKEN, token);
}

/**
 * The lens a stage reader binds to, as a function read on every use: the explicit token, else
 * the nearest `<StageScope>` / `<Stage>`, else the main lens.
 */
export function stageTokenOf(explicit?: () => StageTokenProp | undefined): () => StageTokenProp {
  const scoped = hasContext(STAGE_TOKEN) ? getContext<() => StageTokenProp>(STAGE_TOKEN) : null;
  return () => explicit?.() ?? scoped?.() ?? StageToken;
}

/**
 * The lens stage chrome of your own binds to, as `{ current }`: `token`, else the nearest
 * `<StageScope>` / `<Stage>`, else the main lens.
 */
export function useStageToken(token?: StageTokenProp): { readonly current: StageTokenProp } {
  const lens = stageTokenOf(() => token);
  return {
    get current() {
      return lens();
    },
  };
}

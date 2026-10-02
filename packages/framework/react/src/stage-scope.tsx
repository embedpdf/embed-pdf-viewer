/**
 * StageScope — binds a subtree to a stage lens so the stage hooks and the
 * stage-bound chrome (`<Scrollbar>`, `<SelectionHandles>`) need no positional
 * token. `<Stage>` installs one for its own pages and overlay; an app wraps a
 * second lens (a thumbnail rail) in `<StageScope token={thumbs}>` and writes
 * ordinary hooks inside. An explicit token argument still wins everywhere.
 *
 * Lives apart from `./stage` so entries that only need the scope (selection,
 * scrollbar) never pull the stage surface.
 */
import * as React from 'react';
import { createContext, useContext } from 'react';
import type { CapabilityToken } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';

/** Which stage lens to bind to. Defaults to the main StageToken — pass a custom
 *  token to drive an additional lens (e.g. a wrapped thumbnail sidebar). */
export type StageTokenProp = CapabilityToken<StageCapability>;

const StageTokenContext = createContext<StageTokenProp | null>(null);

export interface StageScopeProps {
  token: StageTokenProp;
  children: React.ReactNode;
}

/** Bind a subtree to a stage lens: hooks and stage chrome inside resolve `token`
 *  unless they are handed one explicitly. */
export function StageScope({ token, children }: StageScopeProps) {
  return <StageTokenContext.Provider value={token}>{children}</StageTokenContext.Provider>;
}

/** The lens a stage hook binds to: the explicit argument, else the nearest
 *  `<StageScope>` / `<Stage>`, else the main lens. */
export function useStageToken(explicit?: StageTokenProp): StageTokenProp {
  const scoped = useContext(StageTokenContext);
  return explicit ?? scoped ?? StageToken;
}

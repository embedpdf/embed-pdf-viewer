/**
 * Declared state and settings as React hooks. A plugin declares its state once
 * with `defineState` and its settings once in its definition (both in
 * `@embedpdf/core`), and its React bindings are one line each:
 *
 *   export const useSearchState = stateHook(searchState);
 *   export const useSearchSettings = settingsHook(SearchToken);
 */
import { shallowEqual } from '@embedpdf/core';
import type { CapabilityToken, SettingsOf, StateDeclaration } from '@embedpdf/core';
import { useDocumentScope, useKernelValue } from './runtime';

/** A declared state's hook: the whole state, or the value `select` picks from it. */
export type StateHook<State> = <Selected = State>(select?: (state: State) => Selected) => Selected;

/** A plugin's settings hook: the settings, or the value `select` picks from them. */
export type SettingsHook<Settings> = <Selected = Settings>(
  select?: (settings: Settings) => Selected,
) => Selected;

/**
 * Turn a state declaration into its hook. The hook reads this subtree's
 * document (the nearest <DocumentScope>, else the active one) and returns the
 * declaration's `empty` while that document is missing or not ready, so it
 * renders anywhere. It re-renders only when a field changes: the state, or the
 * value `select` picks from it, is compared with {@link shallowEqual}.
 */
export function stateHook<Capability, State extends object>(
  declaration: StateDeclaration<Capability, State>,
): StateHook<State> {
  return function useDeclaredState<Selected = State>(
    select?: (state: State) => Selected,
  ): Selected {
    const scoped = useDocumentScope();
    // Resolve on every read, not once per render: a document that closes
    // between a store change and the next render then reads as `empty`,
    // never through its closed capability.
    return useKernelValue((kernel) => {
      const capability = kernel.tryCapability(declaration.token, scoped ?? undefined);
      const state = capability ? declaration.read(capability) : declaration.empty;
      return select ? select(state) : (state as unknown as Selected);
    }, shallowEqual);
  };
}

/**
 * Turn a plugin's token into its settings hook. A plugin's settings belong to
 * the plugin as the app registered it, not to a document, so the hook reads
 * them through the kernel (`kernel.settingsOf`): it works before the first
 * document opens, and every document shows the same settings. It re-renders
 * only when a setting changes: `getSettings()` keeps its object until then,
 * and the value `select` picks is compared with {@link shallowEqual}. A token
 * whose plugin isn't installed, or has no settings, throws: a setup mistake.
 */
export function settingsHook<Capability>(
  token: CapabilityToken<Capability>,
): SettingsHook<SettingsOf<Capability>> {
  return function useSettings<Selected = SettingsOf<Capability>>(
    select?: (settings: SettingsOf<Capability>) => Selected,
  ): Selected {
    return useKernelValue((kernel) => {
      const settings = kernel.settingsOf(token).getSettings();
      return select ? select(settings) : (settings as unknown as Selected);
    }, shallowEqual);
  };
}

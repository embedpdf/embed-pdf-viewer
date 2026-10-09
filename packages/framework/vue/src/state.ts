/**
 * Declared state and settings as Vue composables. A plugin declares its state
 * once with `defineState` and its settings once in its definition (both in
 * `@embedpdf/core`), and its Vue bindings are one line each:
 *
 *   export const useSearchState = stateComposable(searchState);
 *   export const useSearchSettings = settingsComposable(SearchToken);
 *
 * Without a selector they return one ref per field; with one, a single ref.
 */
import { shallowEqual } from '@embedpdf/core';
import type { CapabilityToken, SettingsOf, StateDeclaration } from '@embedpdf/core';
import type { Ref } from 'vue';
import { useDocumentScope, useKernelValue } from './runtime/kernel';
import { fieldRefs } from './runtime/refs';
import type { FieldRefs } from './runtime/refs';

export type { FieldRefs } from './runtime/refs';

/** A declared state's composable: refs for every field, or one ref for the value `select` picks. */
export interface StateComposable<State extends object> {
  (): FieldRefs<State>;
  <Selected>(select: (state: State) => Selected): Readonly<Ref<Selected>>;
}

/** A plugin's settings composable: refs for every setting, or one ref for the value `select` picks. */
export interface SettingsComposable<Settings extends object> {
  (): FieldRefs<Settings>;
  <Selected>(select: (settings: Settings) => Selected): Readonly<Ref<Selected>>;
}

/**
 * Turn a state declaration into its composable. It reads this subtree's
 * document (the nearest `<DocumentScope>`, else the active one) and reads the
 * declaration's `empty` while that document is missing or not ready, so it
 * works anywhere. A ref updates only when its value changes: the state, or the
 * value `select` picks from it, is compared with {@link shallowEqual}.
 */
export function stateComposable<Capability, State extends object>(
  declaration: StateDeclaration<Capability, State>,
): StateComposable<State> {
  function useDeclaredState(): FieldRefs<State>;
  function useDeclaredState<Selected>(
    select: (state: State) => Selected,
  ): Readonly<Ref<Selected>>;
  function useDeclaredState<Selected>(select?: (state: State) => Selected) {
    const scope = useDocumentScope();
    // Resolved on every read: a document that closes reads as `empty` from
    // then on, never through its closed capability.
    const value = useKernelValue((kernel) => {
      const capability = kernel.tryCapability(declaration.token, scope.value ?? undefined);
      const state = capability ? declaration.read(capability) : declaration.empty;
      return select ? select(state) : state;
    }, shallowEqual);
    return select ? value : fieldRefs(value as Readonly<Ref<State>>, Object.keys(declaration.empty));
  }
  return useDeclaredState;
}

/**
 * Turn a plugin's token into its settings composable. A plugin's settings
 * belong to the plugin as the app registered it, not to a document, so it
 * reads them through the kernel (`kernel.settingsOf`): it works before the
 * first document opens, and every document shows the same settings. A token
 * whose plugin isn't installed, or has no settings, throws: a setup mistake.
 */
export function settingsComposable<Capability>(
  token: CapabilityToken<Capability>,
): SettingsComposable<SettingsOf<Capability> & object> {
  type Settings = SettingsOf<Capability> & object;
  function useSettings(): FieldRefs<Settings>;
  function useSettings<Selected>(select: (settings: Settings) => Selected): Readonly<Ref<Selected>>;
  function useSettings<Selected>(select?: (settings: Settings) => Selected) {
    const value = useKernelValue((kernel) => {
      const settings = kernel.settingsOf(token).getSettings() as Settings;
      return select ? select(settings) : settings;
    }, shallowEqual);
    return select ? value : fieldRefs(value as Readonly<Ref<Settings>>);
  }
  return useSettings;
}

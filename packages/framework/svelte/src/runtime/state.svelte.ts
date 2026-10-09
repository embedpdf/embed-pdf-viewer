/**
 * Declared state and settings as Svelte readers. A plugin declares its state once with
 * `defineState` and its settings once in its definition (both in `@embedpdf/core`), and its
 * Svelte bindings are one line each:
 *
 *   export const useSearchState = stateReader(searchState);
 *   export const useSearchSettings = settingsReader(SearchToken);
 *
 * Called with no argument, a reader returns a reactive object (`state.hitCount`), one derived
 * value per field. Called with a selector, it returns the value the selector picks as
 * `{ current }`, compared field by field so a fresh object passes nothing on until a field changes.
 */
import { shallowEqual } from '@embedpdf/core';
import type { CapabilityToken, Kernel, SettingsOf, StateDeclaration } from '@embedpdf/core';
import { documentScopeOf, useKernelBinding, type KernelBinding } from './binding.svelte';
import {
  currentOf,
  derivedValue,
  reactiveRecord,
  type CurrentValue,
  type MaybeGetter,
  valueOf,
} from './values.svelte';

/** A declared state's reader: the whole state, or the value `select` picks from it. */
export interface StateReader<State extends object> {
  (): Readonly<State>;
  <Selected>(select: (state: State) => Selected): CurrentValue<Selected>;
}

/** A plugin's settings reader: the settings, or the value `select` picks from them. */
export interface SettingsReader<Settings extends object> {
  (): Readonly<Settings>;
  <Selected>(select: (settings: Settings) => Selected): CurrentValue<Selected>;
}

/**
 * The whole state, read through the capability `token` resolves for this subtree's document, or
 * `empty` while it can't resolve. Resolved on every read: a document that closes reads as `empty`,
 * never through its closed capability.
 */
export function declaredState<Capability, State extends object>(
  binding: KernelBinding,
  token: MaybeGetter<CapabilityToken<Capability>>,
  read: (capability: Capability) => State,
  empty: State,
): () => State {
  const scoped = documentScopeOf();
  return derivedValue(() => {
    binding.track();
    const capability = binding.kernel.tryCapability(valueOf(token), scoped() ?? undefined);
    return capability ? read(capability) : empty;
  }, shallowEqual);
}

/** The reader's two forms over one getter: a reactive object with `keys`, or a selected value. */
export function readRecord<Record extends object, Selected>(
  whole: () => Record,
  keys: readonly (keyof Record)[],
  select: ((record: Record) => Selected) | undefined,
): Readonly<Record> | CurrentValue<Selected> {
  if (!select) return reactiveRecord(whole, keys);
  return currentOf(derivedValue(() => select(whole()), shallowEqual));
}

/**
 * Turn a state declaration into its reader. It reads this subtree's document (the nearest
 * `<DocumentScope>`, else the active one) and gives the declaration's `empty` while that
 * document is missing or not ready, so it works anywhere.
 */
export function stateReader<Capability, State extends object>(
  declaration: StateDeclaration<Capability, State>,
): StateReader<State> {
  const keys = Object.keys(declaration.empty) as (keyof State)[];
  return function useDeclaredState<Selected>(select?: (state: State) => Selected) {
    const binding = useKernelBinding();
    const whole = declaredState(binding, declaration.token, declaration.read, declaration.empty);
    return readRecord(whole, keys, select);
  } as StateReader<State>;
}

/** A plugin's settings through the kernel: the same with or without a document. */
function settingsOf<Capability>(
  kernel: Kernel,
  token: CapabilityToken<Capability>,
): SettingsOf<Capability> {
  return kernel.settingsOf(token).getSettings() as SettingsOf<Capability>;
}

/**
 * Turn a plugin's token into its settings reader. A plugin's settings belong to the plugin as
 * the app registered it, not to a document, so the reader works before the first document opens
 * and every document shows the same settings. `getSettings()` keeps its object until a setting
 * changes. A token whose plugin isn't installed, or has no settings, throws: a setup mistake.
 */
export function settingsReader<Capability>(
  token: CapabilityToken<Capability>,
): SettingsReader<SettingsOf<Capability> & object> {
  type Settings = SettingsOf<Capability> & object;
  return function useSettings<Selected>(select?: (settings: Settings) => Selected) {
    const binding = useKernelBinding();
    const initial = settingsOf(binding.kernel, token) as Settings;
    const whole = derivedValue(() => {
      binding.track();
      return settingsOf(binding.kernel, token) as Settings;
    }, shallowEqual);
    return readRecord(whole, Object.keys(initial) as (keyof Settings)[], select);
  } as SettingsReader<Settings>;
}

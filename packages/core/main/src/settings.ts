/**
 * A plugin's settings: what the app registered over the plugin's defaults, changed at runtime
 * with `updateSettings()`. A plugin declares them in its definition
 * (`definePlugin({ settings: { defaults, registered } })`), and the kernel builds one store per
 * plugin registration when it plans the plugin list. The store belongs to the registration, not
 * to a document: it exists before the first document opens, every instance of the plugin shares
 * it, and a change reaches every open document and the ones opened later. A plugin reads its
 * store with `ctx.settings()`; an adapter reads it with `kernel.settingsOf(token)`.
 *
 * Changes merge into the settings the same way everywhere (`registered` over the defaults, and
 * every `updateSettings()`): plain objects merge key by key, arrays and every other value
 * replace, and `undefined` leaves a setting as it is.
 */
import { createEventHook, type EventHook } from './event-hook';
import { hasOwn, isPlainObject, sameValue } from './same-value';

/** A change to one setting: plain objects go deeper, arrays and functions are given whole. */
type DeepPartialValue<V> = V extends readonly unknown[] | ((...args: never[]) => unknown)
  ? V
  : V extends object
    ? DeepPartial<V>
    : V;

/** Every field optional, down through the plain objects. */
export type DeepPartial<T> = { readonly [K in keyof T]?: DeepPartialValue<T[K]> };

/** A setting's name, or its path inside a group of settings: `'identity'`, `'snapshot.box'`. */
export type SettingPath<T> = {
  [K in keyof T & string]: T[K] extends readonly unknown[] | ((...args: never[]) => unknown)
    ? K
    : T[K] extends object
      ? K | `${K}.${SettingPath<T[K]>}`
      : K;
}[keyof T & string];

declare const noSettings: unique symbol;

/**
 * The settings of a plugin whose definition declares none. A type of its own rather than `never`:
 * a plugin list mixes plugins with and without settings, and `any` stands in for every type but
 * `never`.
 */
export interface NoSettings {
  readonly [noSettings]: true;
}

/** A plugin's settings as its definition declares them: `definePlugin({ settings })`. */
export interface SettingsDeclaration<T> {
  /** Every setting's value when the app registers none. */
  readonly defaults: T;
  /** What the app registered, usually the plugin factory's config: merged over `defaults`. */
  readonly registered?: DeepPartial<T> | undefined;
  /**
   * Settings that are one value each, such as a person or a box's colors, by name or by their
   * path inside a group (`'snapshot.box'`): a change replaces them whole instead of merging into
   * them, and what it leaves out takes its default, so nothing of the previous value stays.
   */
  readonly whole?: readonly SettingPath<T>[];
}

/** What `onSettingsChanged` carries: the settings after the change, and which of them changed. */
export interface SettingsChangedEvent<T> {
  readonly settings: T;
  /** The top-level settings whose value changed (`['highlight']` when only a highlight color did). */
  readonly changedKeys: readonly (keyof T)[];
}

/** The four settings calls, spread into a plugin's capability. */
export interface SettingsApi<T> {
  /** The settings in effect: the same object until a setting changes. */
  getSettings(): T;
  /**
   * Merge `changes` into the settings, for every document: plain objects merge key by key,
   * arrays and other values replace, and `undefined` leaves a setting as it is. Fires
   * `onSettingsChanged` once when a setting changed.
   */
  updateSettings(changes: DeepPartial<T>): void;
  /** Go back to what the app registered (not to the plugin's defaults). Fires `onSettingsChanged` when a setting changed. */
  resetSettings(): void;
  /** Fires once for each call that changed a setting. */
  readonly onSettingsChanged: EventHook<SettingsChangedEvent<T>>;
}

/**
 * Who holds a locked setting, and why. A plugin that owns settings and lets others hold them (the
 * Stage's `lockSettings()`) answers `getLock(key)` with this, and a command that changes the
 * setting shows disabled with the sentence under `reasonKey` while it holds.
 */
export interface SettingLock {
  /** Who holds it: a plugin's id, or `'app'`. */
  readonly by: string;
  /** The translation key of the sentence its controls show; without one, `commands.locked.default`. */
  readonly reasonKey?: string;
}

/** The settings type of a capability that has the settings calls, else `never`. */
export type SettingsOf<Capability> = Capability extends { getSettings(): infer T } ? T : never;

/** What `ctx.settings()` returns: `get()` for the plugin's own code, `api` for its capability. */
export interface Settings<T> {
  /** The settings in effect. */
  get(): T;
  readonly api: SettingsApi<T>;
}

/** One registration's settings, kept by the kernel. */
export interface SettingsStore<T> {
  /** The calls themselves, bound to no instance: what `kernel.settingsOf(token)` hands out. */
  readonly api: SettingsApi<T>;
  /**
   * The store as one plugin instance sees it: the same settings, with an `onSettingsChanged`
   * of the instance's own. `cleanup` receives the teardown that ends it, so the instance's
   * listeners go when the instance closes; the settings stay.
   */
  forInstance(cleanup: (teardown: () => void) => void): Settings<T>;
  destroy(): void;
}

/**
 * Build a registration's store. `wake` runs after every change, before the event, so readers
 * that poll the capability (selectors over `getSettings()`) read again.
 */
export function createSettingsStore<T extends object>(
  { defaults, registered, whole = [] }: SettingsDeclaration<T>,
  wake: () => void,
  report: (error: unknown) => void,
): SettingsStore<T> {
  const initial = mergeSettings(defaults, registered, { defaults, whole });
  let current = initial;
  const changedHook = createEventHook<SettingsChangedEvent<T>>(report);

  const commit = (next: T): void => {
    const changed = changedKeys(current, next);
    // A call that changes no value changes nothing: no wake, no event, the same object.
    if (changed.length === 0) return;
    current = next;
    wake();
    changedHook.emit({ settings: next, changedKeys: changed });
  };

  const api: SettingsApi<T> = {
    getSettings: () => current,
    updateSettings: (changes) => commit(mergeSettings(current, changes, { defaults, whole })),
    resetSettings: () => commit(initial),
    onSettingsChanged: changedHook.on,
  };

  return {
    api,
    forInstance(cleanup) {
      const instanceChanged = createEventHook<SettingsChangedEvent<T>>(report);
      cleanup(changedHook.on((event) => instanceChanged.emit(event)));
      cleanup(() => instanceChanged.destroy());
      return {
        get: api.getSettings,
        api: { ...api, onSettingsChanged: instanceChanged.on },
      };
    },
    destroy: () => changedHook.destroy(),
  };
}

/**
 * `changes` merged into `settings`, the declaration's `whole` ones replaced instead: the merge
 * every settings store applies, for code that keeps changes before a store exists (an adapter whose engine is
 * still loading). What a change leaves as it was keeps its object, so a reader that compares by
 * reference sees only what really changed.
 */
export function mergeSettings<T>(
  settings: T,
  changes: DeepPartial<T> | undefined,
  declaration?: Pick<SettingsDeclaration<T>, 'defaults' | 'whole'>,
): T {
  const whole = declaration?.whole ?? [];
  if (whole.length === 0 || !isPlainObject(changes)) return mergeValue(settings, changes) as T;
  const paths = whole.map((path) => path.split('.'));
  let merged = mergeValue(settings, withoutPaths(changes, paths));
  for (const path of paths) {
    const change = valueAt(changes, path);
    if (change === undefined) continue;
    const value = filledFrom(valueAt(declaration?.defaults, path), change);
    if (!sameValue(valueAt(merged, path), value)) merged = withValueAt(merged, path, value);
  }
  return merged as T;
}

/** The value at `path` inside `value`, or undefined where the path ends early. */
function valueAt(value: unknown, path: readonly string[]): unknown {
  let at = value;
  for (const key of path) {
    if (!isPlainObject(at) || !hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}

/** `value` with `next` at `path`, the objects along the path copied. */
function withValueAt(value: unknown, path: readonly string[], next: unknown): unknown {
  if (path.length === 0) return next;
  const [key, ...rest] = path as [string, ...string[]];
  const into = isPlainObject(value) ? value : {};
  return { ...into, [key]: withValueAt(into[key], rest, next) };
}

/** `changes` without what lies at `paths`, the objects along each path copied. */
function withoutPaths(changes: Record<string, unknown>, paths: readonly string[][]): unknown {
  let rest: Record<string, unknown> = changes;
  for (const path of paths) {
    if (valueAt(rest, path) === undefined) continue;
    rest = withValueAt(rest, path, undefined) as Record<string, unknown>;
  }
  return rest;
}

/** A whole value: a plain object's keys left out (or `undefined`) take their defaults. */
function filledFrom(defaultValue: unknown, change: unknown): unknown {
  if (!isPlainObject(change) || !isPlainObject(defaultValue)) return change;
  const filled: Record<string, unknown> = { ...defaultValue };
  for (const key of Object.keys(change)) if (change[key] !== undefined) filled[key] = change[key];
  return filled;
}

function mergeValue(base: unknown, change: unknown): unknown {
  if (change === undefined) return base;
  // Arrays and other values replace; an equal one keeps the object already there.
  if (!isPlainObject(change)) return sameValue(base, change) ? base : change;
  const into = isPlainObject(base) ? base : {};
  let merged: Record<string, unknown> | null = null;
  for (const key of Object.keys(change)) {
    const current = hasOwn(into, key) ? into[key] : undefined;
    const next = mergeValue(current, change[key]);
    if (next === current) continue;
    merged ??= { ...into };
    merged[key] = next;
  }
  return merged ?? base;
}

/** The top-level settings whose value differs between `previous` and `next`. */
function changedKeys<T extends object>(previous: T, next: T): (keyof T)[] {
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !sameValue(before[key], after[key])) as (keyof T)[];
}

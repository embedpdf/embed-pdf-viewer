/**
 * A plugin's State table as code: how to read it from the capability, and what
 * it is with no document. The declaration names no framework, so each adapter
 * turns the same declaration into its own reactive form (a React hook, a signal
 * per field, refs, a store) without listing the fields again.
 *
 *   export const searchState = defineState(SearchToken, {
 *     read: (search) => ({ query: search.getQuery(), hitCount: search.getHitCount() }),
 *     empty: { query: null, hitCount: 0 },
 *   });
 */
import type { CapabilityToken } from './types';

export interface StateDeclaration<Capability, State extends object> {
  /** The capability the state is read from; a document plugin's resolves per document. */
  readonly token: CapabilityToken<Capability>;
  /**
   * Read every field through the capability's getters. A getter returns the
   * same value while nothing changed, so adapters compare the result field by
   * field ({@link shallowEqual}) and wake readers only when a field changed.
   */
  readonly read: (capability: Capability) => State;
  /**
   * The state while the capability can't resolve: no document is open, it
   * isn't ready yet, or none is in scope. It has exactly `read`'s fields, so
   * an adapter can list the fields without a capability. Frozen, because every
   * reader shares it.
   */
  readonly empty: State;
}

/**
 * Declare a plugin's state. The fields come from `read`, and `empty` is checked
 * against them (`NoInfer` keeps it out of the inference): a missing field or a
 * value of the wrong type is a type error. Write `empty` inline, because
 * TypeScript refuses an extra field only in an object literal.
 */
export function defineState<Capability, State extends object>(
  token: CapabilityToken<Capability>,
  declaration: {
    readonly read: (capability: Capability) => State;
    readonly empty: NoInfer<State>;
  },
): StateDeclaration<Capability, State> {
  return { token, read: declaration.read, empty: Object.freeze(declaration.empty) };
}

/**
 * One level of identity: equal when the two values are the same, or are
 * objects (or arrays) holding the same values under the same keys. Declared
 * state compares this way, and so does a value a selector picks from it.
 */
export function shallowEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftFields = left as Record<string, unknown>;
  const rightFields = right as Record<string, unknown>;
  const keys = Object.keys(leftFields);
  return (
    keys.length === Object.keys(rightFields).length &&
    keys.every((key) => key in rightFields && Object.is(leftFields[key], rightFields[key]))
  );
}

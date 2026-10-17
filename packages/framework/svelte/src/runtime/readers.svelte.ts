/**
 * The generic readers every plugin binding is built from: a value derived from the kernel, a
 * plugin's capability (as a handle, or the raw object), a value selected from it, and its events.
 *
 * Call them while a component is created, like every `use…()` function: they read the viewer and
 * the document scope from context, and the event readers clean up when the component goes away.
 */
import { untrack } from 'svelte';
import { standInFor } from '@embedpdf/core';
import type { CapabilityToken, EventHook, Kernel } from '@embedpdf/core';
import { documentScopeOf, useKernelBinding } from './binding.svelte';
import { capabilityHandle } from './capability-handle';
import {
  currentOf,
  derivedValue,
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from './values.svelte';

/** Equal when the two arrays hold the same items in the same order. */
export const shallowArray = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left === right || (left.length === right.length && left.every((item, i) => item === right[i]));

/**
 * A value derived from the kernel, computed again after every kernel change and passed on only
 * when `isEqual` says it changed.
 */
export function useKernelValue<R>(
  select: (kernel: Kernel) => R,
  isEqual: (left: R, right: R) => boolean = Object.is,
): CurrentValue<R> {
  const binding = useKernelBinding();
  return currentOf(
    derivedValue(() => {
      binding.track();
      return select(binding.kernel);
    }, isEqual),
  );
}

/** The active document's id, or null with none open. */
export function useActiveDocumentId(): CurrentValue<string | null> {
  return useKernelValue((kernel) => kernel.documents.getActiveId());
}

/** The document the nearest `<DocumentScope>` names, or null when this subtree follows the active one. */
export function useDocumentScope(): CurrentValue<string | null> {
  return currentOf(documentScopeOf());
}

/** The document this subtree talks to: the nearest `<DocumentScope>`'s, else the active one. */
export function useDocumentId(): CurrentValue<string | null> {
  const scoped = documentScopeOf();
  return useKernelValue((kernel) => scoped() ?? kernel.documents.getActiveId());
}

/**
 * A plugin's capability, as a handle that is always the capability of the document in scope
 * (see `./capability-handle.ts`). Outside a ready document a document plugin's calls refuse with
 * `not-ready` (a method that returns a promise rejects), and its settings calls still work. A token no plugin provides throws now: a setup
 * mistake. The token may be a function, for a component whose token is a prop.
 */
export function useCapability<T>(token: MaybeGetter<CapabilityToken<T>>): T {
  const binding = useKernelBinding();
  const { kernel } = binding;
  const scoped = documentScopeOf();
  const initial = untrack(() => valueOf(token));
  if (kernel.scopeOf(initial) !== 'document') kernel.capability(initial);
  return capabilityHandle<T>(
    () => {
      const current = valueOf(token);
      return kernel.tryCapability(current, scoped() ?? undefined) ?? standInFor(kernel, current);
    },
    () => binding.track(),
  );
}

/**
 * The capability itself, or null while the token can't resolve (no plugin, no document, or a
 * document that isn't ready yet). The object is the plugin's own, so it can be handed to code
 * that keeps it, such as an effect that registers something with it.
 */
export function useOptionalCapability<T>(
  token: MaybeGetter<CapabilityToken<T>>,
): CurrentValue<T | null> {
  const binding = useKernelBinding();
  const scoped = documentScopeOf();
  return currentOf(
    derivedValue(() => {
      binding.track();
      return binding.kernel.tryCapability(valueOf(token), scoped() ?? undefined);
    }),
  );
}

/**
 * A value selected from a capability. Strict: while the token can't resolve, reading it throws
 * the kernel's reason (no document, the document is loading), for code that knows a document
 * exists, such as anything inside a `<DocumentGate>`. {@link useOptionalSelector} is its total twin.
 */
export function useSelector<C, R>(
  token: MaybeGetter<CapabilityToken<C>>,
  select: (capability: C) => R,
  isEqual: (left: R, right: R) => boolean = Object.is,
): CurrentValue<R> {
  const binding = useKernelBinding();
  const scoped = documentScopeOf();
  return currentOf(
    derivedValue(() => {
      binding.track();
      const current = valueOf(token);
      const documentId = scoped() ?? undefined;
      const capability =
        binding.kernel.tryCapability(current, documentId) ??
        binding.kernel.capability(current, documentId);
      return select(capability);
    }, isEqual),
  );
}

/**
 * A value selected from a capability, or `fallback` while the token can't resolve: for chrome
 * that stays mounted while no document is open (a zoom readout). A read through a capability
 * whose document closed a moment ago gives `fallback` too.
 */
export function useOptionalSelector<C, R>(
  token: MaybeGetter<CapabilityToken<C>>,
  select: (capability: C) => R,
  fallback: R,
  isEqual: (left: R, right: R) => boolean = Object.is,
): CurrentValue<R> {
  const binding = useKernelBinding();
  const scoped = documentScopeOf();
  return currentOf(
    derivedValue(() => {
      binding.track();
      const capability = binding.kernel.tryCapability(valueOf(token), scoped() ?? undefined);
      if (capability === null) return fallback;
      try {
        return select(capability);
      } catch {
        return fallback;
      }
    }, isEqual),
  );
}

/**
 * Subscribe to one of a capability's events while the component lives:
 * `useCapabilityEvent(StageToken, (stage) => stage.onZoomChanged, handler)`. It subscribes again
 * when the document in scope changes, and not at all without one. Events say what happened;
 * the current value is a state reader's.
 */
export function useCapabilityEvent<C, T>(
  token: MaybeGetter<CapabilityToken<C>>,
  select: (capability: C) => EventHook<T>,
  handler: (event: T) => void,
): void {
  const capability = useOptionalCapability(token);
  $effect(() => {
    const current = capability.current;
    if (!current) return;
    return untrack(() => select(current)((event) => handler(event)));
  });
}

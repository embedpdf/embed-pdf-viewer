/**
 * Capabilities as Vue reads them. A component's setup runs once, so the object
 * `useCapability()` returns is live: every call reaches the capability the
 * subtree resolves to now (the document in scope, or a stand-in while there is
 * none), and the object itself never changes. Selectors are refs, and an event
 * subscription follows the capability and ends with the component.
 *
 * Reads follow the capability vocabulary (docs/conventions/naming.md): a
 * method named `get*`, `list*`, `is*`, `has*` or `can*` reads state, so a call
 * to it in a template, a `computed` or a `watchEffect` updates when its answer
 * changes: `v-if="annotation.canCreate()"` follows the permissions. Every other
 * method tracks nothing: a `watchEffect` that calls `stage.reveal(index)` runs
 * again only when `index` changes.
 */
import { computed, markRaw, toValue, watch } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { isReadMember, standInFor } from '@embedpdf/core';
import type { CapabilityToken, EventHook } from '@embedpdf/core';
import { useDocumentScope, useKernel, useKernelValue, useViewerBinding } from './kernel';

/**
 * Like {@link useCapability}, but a ref that is null while the token can't
 * resolve: no plugin, no document, or a document that isn't ready yet. It
 * changes when the subtree's document does, so a `watch` on it rebinds.
 */
export function useOptionalCapability<Capability>(
  token: MaybeRefOrGetter<CapabilityToken<Capability>>,
): Readonly<Ref<Capability | null>> {
  const scope = useDocumentScope();
  return useKernelValue((kernel) => kernel.tryCapability(toValue(token), scope.value ?? undefined));
}

/**
 * The capability a subtree resolves to, as a ref: the document's while one is
 * ready, else the stand-in for a document plugin. A token no plugin provides
 * throws here, at setup: that is a setup mistake.
 */
export function useCapabilityRef<Capability>(
  token: MaybeRefOrGetter<CapabilityToken<Capability>>,
): Readonly<Ref<Capability>> {
  const kernel = useKernel();
  const resolved = useOptionalCapability(token);
  const capability = computed(() => {
    const current = resolved.value;
    if (current) return current;
    const wanted = toValue(token);
    if (kernel.scopeOf(wanted) === 'document') return standInFor(kernel, wanted);
    return kernel.capability(wanted);
  });
  // Resolve once now, so a missing plugin fails where it is used.
  void capability.value;
  return capability;
}

/**
 * A plugin's API for this subtree: `const stage = useCapability(StageToken)`,
 * then `stage.zoomIn()` in a handler or a template. The object stays the same
 * for the component's life and always calls the capability of the document in
 * scope, so it is safe to keep in a closure. A read (`stage.getZoomLevel()`)
 * in a template or a computed updates when its answer changes.
 *
 * Outside a document (none open, not ready yet, or none in scope), a document
 * plugin's members belong to its stand-in: reading one never throws, so chrome
 * renders before the first document opens, and calling one refuses with
 * `PluginError('not-ready')`: a method that returns a promise rejects, the
 * others throw.
 */
export function useCapability<Capability>(
  token: MaybeRefOrGetter<CapabilityToken<Capability>>,
): Capability {
  return liveCapability(useCapabilityRef(token), useViewerBinding().track);
}

/** Vue's own flags (`__v_skip`, `__v_isRef`): answered by the target, so Vue never wraps the object. */
const isVueFlag = (key: string | symbol): boolean =>
  typeof key === 'string' && key.startsWith('__v_');

type Members = Record<string, unknown>;
type Method = (...args: unknown[]) => unknown;

/**
 * The object {@link useCapability} returns, over `current`, the capability the
 * subtree resolves to. A read resolves it in a `computed` of its own that also
 * follows the kernel, so whoever reads the call depends on its answer; a verb
 * resolves the capability as it is now, without making the caller depend on
 * anything.
 */
function liveCapability<Capability>(
  current: Readonly<Ref<Capability>>,
  track: () => void,
): Capability {
  // The capability now, kept without a dependency: what a verb calls.
  let latest = current.value;
  watch(current, (capability) => (latest = capability), { flush: 'sync' });
  const resolve = (tracked: boolean): unknown => (tracked ? current.value : latest);
  return liveMember(resolve, track, null) as Capability;
}

/**
 * A live member over `resolve(tracked)`: the capability, or a namespace in it
 * (`annotation.comments`). Members are cached by name, so `stage.zoomIn` is the
 * same function every time; a member that is a plain value is read as it is
 * now. Marked raw, so Vue never makes it reactive.
 */
function liveMember(
  resolve: (tracked: boolean) => unknown,
  track: () => void,
  call: ((args: unknown[]) => unknown) | null,
): object {
  const members = new Map<string, object>();
  // A function target, so a member can be called and can have members of its own.
  const target = markRaw(call ? function member() {} : {});
  return new Proxy(target, {
    apply: (_target, _this, args) => call!(args),
    has: (_target, key) => {
      const value = resolve(false);
      return (typeof value === 'object' || typeof value === 'function') && value !== null
        ? key in value
        : false;
    },
    get(_target, key) {
      if (isVueFlag(key)) return Reflect.get(target, key);
      // Not a thenable, and inspecting it never resolves anything.
      if (typeof key === 'symbol' || key === 'then') return undefined;
      const value = (resolve(false) as Members | null)?.[key];
      if (typeof value !== 'function' && (typeof value !== 'object' || value === null)) {
        return value;
      }
      let member = members.get(key);
      if (!member) {
        const invoke = (tracked: boolean, args: unknown[]): unknown => {
          const owner = resolve(tracked) as Members;
          // `Reflect.apply`, not `.apply`: a stand-in's member answers every property, `apply` too.
          return Reflect.apply(owner[key] as Method, owner, args);
        };
        member = liveMember(
          (tracked) => (resolve(tracked) as Members)[key],
          track,
          isReadMember(key)
            ? // A computed of its own for each call: its reader wakes when the answer changes.
              (args) =>
                computed(() => {
                  track();
                  return invoke(true, args);
                }).value
            : (args) => invoke(false, args),
        );
        members.set(key, member);
      }
      return member;
    },
  });
}

/**
 * A value read from a capability, as a ref. Strict: while the token can't
 * resolve, reading it throws the kernel's reason (`no document`, `document is
 * loading`), for code that knows a document exists, such as anything inside a
 * `<DocumentGate>`. {@link useOptionalSelector} is its total twin.
 */
export function useSelector<Capability, Value>(
  token: MaybeRefOrGetter<CapabilityToken<Capability>>,
  select: (capability: Capability) => Value,
  isEqual: (left: Value, right: Value) => boolean = Object.is,
): Readonly<Ref<Value>> {
  const scope = useDocumentScope();
  return useKernelValue((kernel) => {
    const wanted = toValue(token);
    const documentId = scope.value ?? undefined;
    const capability =
      kernel.tryCapability(wanted, documentId) ?? kernel.capability(wanted, documentId);
    return select(capability);
  }, isEqual);
}

/**
 * Null-safe {@link useSelector}: `fallback` whenever the token can't resolve
 * (no provider, or a document-scoped token with no document). For chrome that
 * stays mounted across the empty workspace (a zoom readout, a mode band). A
 * read through a capability whose document closed a moment ago is `fallback`
 * too.
 */
export function useOptionalSelector<Capability, Value>(
  token: MaybeRefOrGetter<CapabilityToken<Capability>>,
  select: (capability: Capability) => Value,
  fallback: Value,
  isEqual: (left: Value, right: Value) => boolean = Object.is,
): Readonly<Ref<Value>> {
  const scope = useDocumentScope();
  return useKernelValue((kernel) => {
    const capability = kernel.tryCapability(toValue(token), scope.value ?? undefined);
    if (capability === null) return fallback;
    try {
      return select(capability);
    } catch {
      return fallback;
    }
  }, isEqual);
}

/**
 * Subscribe to a capability's {@link EventHook} while the component lives:
 * `useCapabilityEvent(ActionsToken, (actions) => actions.onExecuted, handler)`.
 * Events carry occurrences, never state (a late subscriber that needs the
 * current value uses a selector). It subscribes to the document in scope, again
 * when that document changes, and ends with the component. Null-safe: with no
 * plugin or no document there is no subscription.
 */
export function useCapabilityEvent<Capability, Event>(
  token: MaybeRefOrGetter<CapabilityToken<Capability>>,
  select: (capability: Capability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  const capability = useOptionalCapability(token);
  // `sync`: subscribed in the same change that made the capability resolvable,
  // so no event between that change and the next render is missed.
  watch(
    capability,
    (current, _previous, onCleanup) => {
      if (!current) return;
      onCleanup(select(current)((event) => handler(event)));
    },
    { immediate: true, flush: 'sync' },
  );
}

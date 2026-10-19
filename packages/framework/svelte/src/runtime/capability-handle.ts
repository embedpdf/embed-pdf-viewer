/**
 * What `useStage()`, `useDocuments()` and every other `use<Plugin>()` return: a handle that is
 * always the capability of the document in scope.
 *
 * A component calls `use<Plugin>()` once, when it is created, but the document it talks to can
 * change (another tab becomes active, a `<DocumentScope id>` changes) and can be missing (none is
 * open yet). So the handle resolves the capability again on every call. Without a ready document
 * it reaches the plugin's stand-in (`standInFor` from `@embedpdf/core`), whose calls refuse with
 * `not-ready`: a method that returns a promise rejects, the others throw.
 *
 * Reads follow the capability vocabulary (docs/conventions/naming.md): a member named `get*`,
 * `list*`, `is*`, `has*` or `can*` reads state, so calling it in a template or a `$derived`
 * subscribes to the kernel: `{#if annotation.canCreate()}` updates when the answer changes. Every
 * other member is a verb or an event and subscribes to nothing: an effect that calls
 * `stage.reveal(index)` runs again only when `index` changes.
 */
import { untrack } from 'svelte';
import { isReadMember } from '@embedpdf/core';

type Members = Record<string | symbol, unknown>;
type Method = (...args: unknown[]) => unknown;

/**
 * A handle over `resolve()`. Members are cached by name, so `stage.zoomIn` is the same function
 * every time, and a namespace (`annotation.comments`) is itself a handle. A member that is a
 * plain value is read as it is now.
 */
export function capabilityHandle<T>(resolve: () => unknown, track: () => void): T {
  return memberHandle(resolve, track, null) as T;
}

function memberHandle(
  resolve: () => unknown,
  track: () => void,
  call: ((args: unknown[]) => unknown) | null,
): object {
  const members = new Map<string, object>();
  // A function target, so a member can be called and can have members of its own.
  const target = call ? function member() {} : {};
  return new Proxy(target, {
    apply: (_target, _this, args) => call!(args),
    has(_target, key) {
      const value = untrack(resolve);
      return (typeof value === 'object' || typeof value === 'function') && value !== null
        ? key in value
        : false;
    },
    get(_target, key) {
      // Not a thenable, and inspecting it never resolves anything.
      if (typeof key === 'symbol' || key === 'then') return undefined;
      const value = untrack(() => (resolve() as Members | null)?.[key]);
      if (typeof value !== 'function' && (typeof value !== 'object' || value === null)) {
        return value;
      }
      let member = members.get(key);
      if (!member) {
        const resolveMember = () => (resolve() as Members)[key];
        member = memberHandle(resolveMember, track, (args) => invoke(resolve, key, args, track));
        members.set(key, member);
      }
      return member;
    },
  });
}

/**
 * Call `key` on what `resolve()` gives now, with it as `this`. `Reflect.apply`, not `.apply`: a
 * stand-in's member answers every property, `apply` too.
 */
function invoke(resolve: () => unknown, key: string, args: unknown[], track: () => void): unknown {
  if (isReadMember(key)) {
    track();
    const owner = resolve() as Members;
    return Reflect.apply(owner[key] as Method, owner, args);
  }
  return untrack(() => {
    const owner = resolve() as Members;
    return Reflect.apply(owner[key] as Method, owner, args);
  });
}

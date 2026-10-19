/**
 * What every framework adapter's plugin API shares (`useStage()`, `inject(EpdfSearch)`): which
 * members are reads, and what a document plugin's API reaches while its part of the app has no
 * ready document.
 *
 * Reads follow the capability vocabulary (docs/conventions/naming.md): a member named `get*`,
 * `list*`, `is*`, `has*` or `can*` reads state, so an adapter makes a call to it in a template or
 * a derived value update when its answer changes, and every other member tracks nothing.
 *
 * Without a document there is no capability to call, so the API reaches a stand-in: reading a
 * member never throws, so chrome renders before the first document opens, and calling one refuses
 * with `not-ready`. A member the token lists in `promises` returns the refusal as a rejected
 * promise, as the capability itself would, so a `.catch()` sees it; every other member throws.
 * The settings calls work: a plugin's settings belong to the plugin, not to a document.
 */
import { PluginError } from './errors';
import type { Kernel } from './kernel';
import type { CapabilityToken } from './types';

const READ = /^(?:get|list|is|has|can)(?:[A-Z]|$)/;

/** Whether a capability member named `name` is a read: `get*`, `list*`, `is*`, `has*` or `can*`. */
export function isReadMember(name: string): boolean {
  return READ.test(name);
}

/** Whether the member at `path` (`'setValue'`, `'comments.reply'`) returns a promise, as `token` declares. */
export function returnsPromise(token: CapabilityToken<unknown>, path: string): boolean {
  return token.promises?.[path] === true;
}

/** The capability members that work without a document: a plugin's settings are the plugin's own. */
const SETTINGS_CALLS: ReadonlySet<string> = new Set([
  'getSettings',
  'updateSettings',
  'resetSettings',
  'onSettingsChanged',
]);

const standIns = new WeakMap<Kernel, WeakMap<CapabilityToken<unknown>, object>>();

/**
 * What a framework adapter's API reaches for a document plugin while its part of the app has no
 * ready document. One per kernel and token, so it is the same object on every read.
 */
export function standInFor<T>(kernel: Kernel, token: CapabilityToken<T>): T {
  let byToken = standIns.get(kernel);
  if (!byToken) {
    byToken = new WeakMap();
    standIns.set(kernel, byToken);
  }
  let standIn = byToken.get(token);
  if (!standIn) {
    standIn = createStandIn(token, () => kernel.settingsOf(token));
    byToken.set(token, standIn);
  }
  return standIn as T;
}

/**
 * A Proxy whose every member is a function that refuses with `not-ready`. A member is itself such
 * a Proxy, so namespaces work too (`annotation.comments.reply`). Members are cached by path, so
 * `stage.zoomIn` is the same function on every read. `then`, symbol keys and keys that start with
 * `__` (a framework's own flags, such as Vue's `__v_isRef`) read as undefined: the stand-in is no
 * thenable, and inspecting it doesn't throw. The four settings calls forward to `settings()` when
 * called; for a plugin without settings, they refuse too.
 */
function createStandIn(token: CapabilityToken<unknown>, settings: () => object): object {
  const refusal = () => new PluginError('not-ready', token.name, 'no document is open');
  const refuse = (path: string) => (): unknown => {
    if (returnsPromise(token, path)) return Promise.reject(refusal());
    throw refusal();
  };
  const forward =
    (name: string) =>
    (...args: unknown[]): unknown => {
      // A plugin whose definition declares no settings (the Stage keeps its own, per view) has
      // none to reach without a document either.
      let api: Record<string, (...args: unknown[]) => unknown>;
      try {
        api = settings() as typeof api;
      } catch {
        throw refusal();
      }
      return api[name]!(...args);
    };
  const members = new Map<string, unknown>();
  const memberOf = (parentPath: string, key: string | symbol): unknown => {
    if (typeof key === 'symbol' || key === 'then' || key.startsWith('__')) return undefined;
    const path = parentPath ? `${parentPath}.${key}` : key;
    let member = members.get(path);
    if (!member) {
      member =
        !parentPath && SETTINGS_CALLS.has(key)
          ? forward(key)
          : new Proxy(refuse(path), { get: (_refuse, next) => memberOf(path, next) });
      members.set(path, member);
    }
    return member;
  };
  return new Proxy({}, { get: (_capability, key) => memberOf('', key) });
}

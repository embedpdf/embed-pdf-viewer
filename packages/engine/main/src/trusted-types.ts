/**
 * Starting workers on a page with Trusted Types: the engine's one policy, `embedpdf`.
 *
 * Under `require-trusted-types-for 'script'`, `new Worker(url)` takes only a `TrustedScriptURL`,
 * so every worker the engine starts from a URL goes through {@link startWorker}, and the policy
 * passes only URLs the engine decided on: its own worker files, the blob: URLs it made, and the
 * worker URLs the embedder configured. Each is added with {@link allowWorkerUrl} where it is
 * decided. A page then needs `trusted-types embedpdf` and nothing else for the engine.
 *
 * A page has one policy of a name (a second `createPolicy('embedpdf')` throws unless its CSP says
 * `'allow-duplicates'`), so the policy and its allowlist live under a well-known global, and a
 * second copy of the engine on the page shares the first one's.
 */

const POLICY_NAME = 'embedpdf';
const SHARED_KEY = Symbol.for('@embedpdf/engine/trusted-types');

/** The part of a Trusted Types policy the engine uses (the DOM typings have none). */
interface ScriptUrlPolicy {
  createScriptURL(url: string): unknown;
}

interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL: (url: string) => string }): ScriptUrlPolicy;
}

interface SharedPolicy {
  /** Absolute URLs the engine may start a worker from. */
  readonly allowed: Set<string>;
  /** Undefined until the first worker starts; null where there is no policy to use. */
  policy?: ScriptUrlPolicy | null;
}

type GlobalWithShared = typeof globalThis & {
  [SHARED_KEY]?: SharedPolicy;
  trustedTypes?: TrustedTypesFactory;
};

function shared(): SharedPolicy {
  const scope = globalThis as GlobalWithShared;
  return (scope[SHARED_KEY] ??= { allowed: new Set() });
}

/** Let the engine start workers from `url` (absolute, exactly as it is started). */
export function allowWorkerUrl(url: string): void {
  shared().allowed.add(url);
}

/** Take back {@link allowWorkerUrl}, for a blob: URL that is revoked. */
export function disallowWorkerUrl(url: string): void {
  shared().allowed.delete(url);
}

/**
 * Start a worker from a URL the engine allowed. Throws for any other URL, in every browser, so a
 * URL that skipped the allowlist fails the same way with and without Trusted Types.
 */
export function startWorker(url: string, options?: WorkerOptions): Worker {
  const scriptUrl = toScriptUrl(url);
  // The DOM typings predate Trusted Types: the constructor takes a TrustedScriptURL as well.
  return new Worker(scriptUrl as string, options);
}

/** A blob: URL of `source`, allowed until `revoke()`. */
export function createWorkerBlobUrl(source: string): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  allowWorkerUrl(url);
  return {
    url,
    revoke: () => {
      disallowWorkerUrl(url);
      URL.revokeObjectURL(url);
    },
  };
}

function toScriptUrl(url: string): unknown {
  checkAllowed(url);
  const policy = scriptUrlPolicy();
  return policy ? policy.createScriptURL(url) : url;
}

function checkAllowed(url: string): void {
  if (shared().allowed.has(url)) return;
  throw new TypeError(
    `[embedpdf] will not start a worker from ${url}: it is neither one of the engine's own ` +
      'worker files nor a configured `worker` / `encoderWorker` URL',
  );
}

/**
 * The page's `embedpdf` policy, created on the first worker start rather than on import, so a
 * page that never starts a worker never asks for it. Null where the browser has no Trusted Types
 * or the page's CSP does not allow the name: the plain URL is then the only thing to pass.
 */
function scriptUrlPolicy(): ScriptUrlPolicy | null {
  const record = shared();
  if (record.policy !== undefined) return record.policy;
  const factory = (globalThis as GlobalWithShared).trustedTypes;
  let policy: ScriptUrlPolicy | null = null;
  if (factory && typeof factory.createPolicy === 'function') {
    try {
      policy = factory.createPolicy(POLICY_NAME, {
        createScriptURL: (url) => {
          checkAllowed(url);
          return url;
        },
      });
    } catch {
      // The page's `trusted-types` directive does not list `embedpdf`.
      policy = null;
    }
  }
  record.policy = policy;
  return policy;
}

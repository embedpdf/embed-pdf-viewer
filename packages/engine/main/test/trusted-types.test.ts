/**
 * The engine's Trusted Types policy: one `embedpdf` policy per page, shared by every copy of the
 * engine on it, that passes only the worker URLs the engine allowed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SHARED_KEY = Symbol.for('@embedpdf/engine/trusted-types');
const WORKER_FILE = 'https://app.test/assets/embedpdf-worker-abc.js';
const OTHER_FILE = 'https://app.test/assets/encoder-worker-def.js';

class FakeWorker {
  constructor(
    readonly url: unknown,
    readonly options?: WorkerOptions,
  ) {}
}

/** A `trustedTypes` that records the policies made; `refuse` is a page whose CSP doesn't list the name. */
function fakeTrustedTypes(options: { refuse?: boolean } = {}) {
  const policies: string[] = [];
  const factory = {
    createPolicy(name: string, rules: { createScriptURL: (url: string) => string }) {
      if (options.refuse) throw new TypeError(`Policy "${name}" disallowed.`);
      policies.push(name);
      return { createScriptURL: (url: string) => ({ trusted: rules.createScriptURL(url) }) };
    },
  };
  return { policies, factory };
}

const clearShared = () => {
  delete (globalThis as Record<symbol, unknown>)[SHARED_KEY];
};

beforeEach(() => {
  vi.resetModules();
  clearShared();
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearShared();
});

const load = () => import('../src/trusted-types');

describe('startWorker', () => {
  it('starts an allowed URL through one policy named embedpdf', async () => {
    const trustedTypes = fakeTrustedTypes();
    vi.stubGlobal('trustedTypes', trustedTypes.factory);
    const { allowWorkerUrl, startWorker } = await load();

    allowWorkerUrl(WORKER_FILE);
    const first = startWorker(WORKER_FILE, { type: 'module' }) as unknown as FakeWorker;
    startWorker(WORKER_FILE, { type: 'module' });

    expect(first.url).toEqual({ trusted: WORKER_FILE });
    expect(first.options).toEqual({ type: 'module' });
    expect(trustedTypes.policies).toEqual(['embedpdf']);
  });

  it('refuses a URL nobody allowed, with Trusted Types and without', async () => {
    const { startWorker } = await load();
    expect(() => startWorker(WORKER_FILE)).toThrow(/will not start a worker from/);

    vi.resetModules();
    clearShared();
    vi.stubGlobal('trustedTypes', fakeTrustedTypes().factory);
    const withPolicy = await load();
    expect(() => withPolicy.startWorker(WORKER_FILE)).toThrow(/will not start a worker from/);
  });

  it('shares the policy and the allowlist with a second copy of the engine on the page', async () => {
    const trustedTypes = fakeTrustedTypes();
    vi.stubGlobal('trustedTypes', trustedTypes.factory);
    const first = await load();
    first.allowWorkerUrl(WORKER_FILE);
    first.startWorker(WORKER_FILE);

    vi.resetModules();
    const second = await load();
    expect(second).not.toBe(first);
    second.allowWorkerUrl(OTHER_FILE);

    expect((second.startWorker(OTHER_FILE) as unknown as FakeWorker).url).toEqual({
      trusted: OTHER_FILE,
    });
    expect((first.startWorker(OTHER_FILE) as unknown as FakeWorker).url).toEqual({
      trusted: OTHER_FILE,
    });
    // A second createPolicy('embedpdf') would throw on a page that lists the name once.
    expect(trustedTypes.policies).toEqual(['embedpdf']);
  });

  it('passes the plain URL where the page does not allow the policy', async () => {
    vi.stubGlobal('trustedTypes', fakeTrustedTypes({ refuse: true }).factory);
    const { allowWorkerUrl, startWorker } = await load();
    allowWorkerUrl(WORKER_FILE);
    expect((startWorker(WORKER_FILE) as unknown as FakeWorker).url).toBe(WORKER_FILE);
  });
});

describe('createWorkerBlobUrl', () => {
  it('allows the blob: URL it makes until it is revoked', async () => {
    const { createWorkerBlobUrl, startWorker } = await load();
    const blob = createWorkerBlobUrl('self.onmessage = null;');
    expect(blob.url.startsWith('blob:')).toBe(true);
    expect((startWorker(blob.url) as unknown as FakeWorker).url).toBe(blob.url);

    blob.revoke();
    expect(() => startWorker(blob.url)).toThrow(/will not start a worker from/);
  });
});

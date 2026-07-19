import { describe, expect, it, vi } from 'vitest';
import { AbortablePromise } from '@embedpdf/engine-core/runtime';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import { isCancelled } from '../src/scope';
import type { AnyPlugin, EffectContext, PluginContext } from '../src/types';

/**
 * Interleaving tests for the session lifecycle: close/destroy racing every
 * await boundary of open/unlock, transactional rollback on failure, and the
 * kernel status machine. Every scenario asserts the resource invariant — the
 * handle is closed, subscriptions are gone, slices are removed — not just the
 * visible tab state.
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
const page = (pon: number, index: number): PageLayout => ({
  index,
  pageObjectNumber: pon,
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: { ...box }, crop: { ...box } },
});

class FakeEvents {
  private readonly listeners = new Set<(e: unknown) => void>();
  subscribe(listener: (e: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  lastServerId(): number | null {
    return null;
  }
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

interface FakeHandleOptions {
  security?: unknown;
  listGate?: Promise<void>;
  listRejection?: unknown;
}

function makeHandle(id: string, opts: FakeHandleOptions = {}) {
  const events = new FakeEvents();
  const handle = {
    id,
    events,
    pages: {
      list: async () => {
        await opts.listGate;
        if (opts.listRejection) throw opts.listRejection;
        return { pageCount: 1, pages: [page(1, 0)] };
      },
    },
    security: opts.security,
    close: vi.fn(() => Promise.resolve()),
  };
  return { handle: handle as unknown as DocumentHandle, events, close: handle.close };
}

function controllableEngine() {
  const waiting = new Map<
    string,
    { resolve: (handle: DocumentHandle) => void; reject: (error: unknown) => void }
  >();
  const engine = {
    open: (input: { id?: string }) =>
      new Promise<DocumentHandle>((resolve, reject) => {
        waiting.set(input.id ?? '?', { resolve, reject });
      }),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  return {
    engine,
    resolve: (id: string, handle: DocumentHandle) => {
      waiting.get(id)!.resolve(handle);
      waiting.delete(id);
    },
    reject: (id: string, error: unknown) => {
      waiting.get(id)!.reject(error);
      waiting.delete(id);
    },
  };
}

const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });
const settle = () => new Promise((r) => setTimeout(r, 0));
const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
};

describe('interleaving: close racing every open await', () => {
  it('close during the source thunk: open rejects cancelled, nothing exists', async () => {
    const { engine } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const fetchGate = gate();
    const open = kernel.documents.open(() => fetchGate.promise.then(() => bytesInput('a')));

    await kernel.documents.close(kernel.documents.list()[0].id);
    fetchGate.open();
    await expect(open).rejects.toSatisfy(isCancelled);
    expect(kernel.documents.list()).toEqual([]);
  });

  it('the thunk receives an AbortSignal that fires on close', async () => {
    const { engine } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    let seenSignal: AbortSignal | null = null;
    const fetchGate = gate();
    const open = kernel.documents.open((signal) => {
      seenSignal = signal;
      return fetchGate.promise.then(() => bytesInput('a'));
    });

    expect(seenSignal!.aborted).toBe(false);
    await kernel.documents.close(kernel.documents.list()[0].id);
    expect(seenSignal!.aborted).toBe(true); // a well-behaved fetch stops here
    fetchGate.open();
    await expect(open).rejects.toSatisfy(isCancelled);
  });

  it('close during an ABORTABLE engine.open: the worker-side work is aborted', async () => {
    let abortedReason: unknown = null;
    const engine = {
      open: () =>
        new AbortablePromise<DocumentHandle>((_resolve, _reject, _progress, signal) => {
          signal.addEventListener('abort', () => (abortedReason = signal.reason), { once: true });
        }),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const open = kernel.documents.open(bytesInput('a'));

    await kernel.documents.close('a');
    expect(abortedReason).not.toBeNull(); // close reached INTO the engine call
    await expect(open).rejects.toSatisfy(isCancelled);
    expect(kernel.documents.list()).toEqual([]);
  });

  it('close during pages.list: join completes, handle closes, no leak', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const listGate = gate();
    const { handle, events, close } = makeHandle('a', { listGate: listGate.promise });

    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await settle(); // open is now awaiting pages.list

    const closed = kernel.documents.close('a');
    listGate.open();
    await closed;
    await expect(open).rejects.toSatisfy(isCancelled);
    expect(close).toHaveBeenCalledTimes(1);
    expect(events.subscriberCount).toBe(0);
  });

  it('close during a plugin init: close JOINS the init, then rolls everything back', async () => {
    const { engine, resolve } = controllableEngine();
    const initGate = gate();
    const lateCleanup = vi.fn();
    const initSettled = vi.fn();
    const effectsInstalled = vi.fn();
    const plugin: AnyPlugin = {
      id: 'slow',
      scope: 'document',
      init: async (ctx: PluginContext<unknown>) => {
        await initGate.promise;
        ctx.cleanup(lateCleanup); // registered while close is already in flight
        initSettled();
      },
      effects: effectsInstalled,
    };
    const kernel = createKernel({ engine, plugins: [plugin], report: () => {} });
    const { handle, events, close } = makeHandle('a');

    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await settle(); // bring-up is awaiting the plugin init

    let closeResolved = false;
    const closed = kernel.documents.close('a').then(() => (closeResolved = true));
    await settle();
    expect(closeResolved).toBe(false); // close is JOINING the in-flight init
    expect(kernel.documents.list()).toEqual([]); // but the tab is already gone

    initGate.open();
    await closed;
    expect(initSettled).toHaveBeenCalledTimes(1); // join means the producer finished
    expect(effectsInstalled).not.toHaveBeenCalled(); // checkpoint stopped the bring-up
    expect(lateCleanup).toHaveBeenCalledTimes(1); // late registration ran, not dropped
    expect(close).toHaveBeenCalledTimes(1);
    expect(events.subscriberCount).toBe(0);
    expect(Object.keys(kernel.getState().plugins)).toEqual([]); // slice rolled back
    await expect(open).rejects.toSatisfy(isCancelled);
  });
});

describe('interleaving: transactional open (publish-last)', () => {
  it('a failing plugin init rolls back: error tab, handle closed, nothing half-alive', async () => {
    const { engine, resolve } = controllableEngine();
    const plugin: AnyPlugin = {
      id: 'broken',
      scope: 'document',
      init: () => Promise.reject(new Error('init exploded')),
    };
    const kernel = createKernel({ engine, plugins: [plugin], report: () => {} });
    const { handle, events, close } = makeHandle('a');

    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await expect(open).rejects.toThrow('init exploded');

    expect(kernel.documents.get('a')!.status).toBe('error'); // NOT a zombie 'ready'
    expect(close).toHaveBeenCalledTimes(1);
    expect(events.subscriberCount).toBe(0);
    expect(Object.keys(kernel.getState().plugins)).toEqual([]);

    // The error tab occupies the id until closed; then the id is reusable.
    await kernel.documents.close('a');
    expect(kernel.documents.get('a')).toBeNull();
  });

  it('a throwing effect SETUP is part of the transaction: same rollback as init', async () => {
    const { engine, resolve } = controllableEngine();
    const plugin: AnyPlugin = {
      id: 'bad-effects',
      scope: 'document',
      effects: () => {
        throw new Error('effect setup exploded');
      },
    };
    const kernel = createKernel({ engine, plugins: [plugin], report: () => {} });
    const { handle, close } = makeHandle('a');

    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await expect(open).rejects.toThrow('effect setup exploded');
    expect(kernel.documents.get('a')!.status).toBe('error');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('effect CALLBACKS that throw post-commit are isolated, never unwind a transition', async () => {
    const { engine, resolve } = controllableEngine();
    const report = vi.fn();
    const sane: string[] = [];
    const throwing: AnyPlugin = {
      id: 'throwing',
      scope: 'document',
      effects: (ctx: EffectContext<unknown>) => {
        ctx.onAction('poke', () => {
          throw new Error('callback exploded');
        });
      },
    };
    const observer: AnyPlugin = {
      id: 'observer',
      scope: 'document',
      effects: (ctx: EffectContext<unknown>) => {
        ctx.onAction('poke', () => sane.push('saw it'));
      },
      capability: (ctx) => ({ poke: () => ctx.dispatch({ type: 'poke' }) }),
      token: { name: 'observer' },
    };
    const kernel = createKernel({ engine, plugins: [throwing, observer], report });
    const { handle } = makeHandle('a');
    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    const id = await open;

    kernel.capability<{ poke: () => void }>(observer.token as never, id).poke();
    expect(sane).toEqual(['saw it']); // sibling listener still ran
    expect(report).toHaveBeenCalled(); // and the failure was reported, not swallowed
    expect(kernel.documents.get(id)!.status).toBe('ready'); // document unharmed
  });

  it('a ticket that reconciles onto an id that is already open fails cleanly', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const first = makeHandle('dup');
    const openFirst = kernel.documents.open(bytesInput('dup'));
    resolve('dup', first.handle);
    await openFirst;

    const open = kernel.documents.open(() => Promise.resolve(bytesInput('dup')));
    await expect(open).rejects.toThrow(/duplicate document id/);
    expect(kernel.documents.get('dup')!.status).toBe('ready'); // original untouched
    expect(first.close).not.toHaveBeenCalled();
    // The ticket slot parked as error — closable, like any failed open.
    const errorSlot = kernel.documents.list().find((d) => d.status === 'error');
    expect(errorSlot).toBeDefined();
    await kernel.documents.close(errorSlot!.id);
    expect(kernel.documents.count()).toBe(1);
  });
});

describe('interleaving: locked documents', () => {
  function lockedSecurity(correctPassword: string, unlockGate?: Promise<void>) {
    let unlocked = false;
    return {
      get passwordPrompt() {
        return unlocked ? { state: 'none' as const } : { state: 'required' as const, hint: null };
      },
      unlock: vi.fn(async ({ password }: { password: string }) => {
        await unlockGate;
        if (password !== correctPassword) throw new Error('incorrect password');
        unlocked = true;
        return {};
      }),
    };
  }

  it('close during unlock: unlock rejects cancelled, handle closes once', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const unlockGate = gate();
    const { handle, close } = makeHandle('a', {
      security: lockedSecurity('pw', unlockGate.promise),
    });
    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await open;
    expect(kernel.documents.get('a')!.status).toBe('locked');

    const unlock = kernel.documents.unlock('a', { password: 'pw' });
    const closed = kernel.documents.close('a');
    unlockGate.open();
    await closed;
    await expect(unlock).rejects.toSatisfy(isCancelled);
    expect(close).toHaveBeenCalledTimes(1);
    expect(kernel.documents.list()).toEqual([]);
  });

  it('a post-password failure is a REAL failure: error tab, resources disposed', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const { handle, close } = makeHandle('a', {
      security: lockedSecurity('pw'),
      listRejection: new Error('pages exploded'),
    });
    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await open;

    await expect(kernel.documents.unlock('a', { password: 'pw' })).rejects.toThrow(
      'pages exploded',
    );
    expect(kernel.documents.get('a')!.status).toBe('error'); // NOT still locked
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('concurrent unlocks: the second is rejected as an active transition', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const unlockGate = gate();
    const { handle } = makeHandle('a', { security: lockedSecurity('pw', unlockGate.promise) });
    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await open;

    const first = kernel.documents.unlock('a', { password: 'pw' });
    await expect(kernel.documents.unlock('a', { password: 'pw' })).rejects.toThrow(
      /active transition/,
    );
    unlockGate.open();
    await first;
    expect(kernel.documents.get('a')!.status).toBe('ready');
  });
});

describe('kernel status machine', () => {
  const instantEngine = () =>
    ({
      open: (input: { id?: string }) => Promise.resolve(makeHandle(input.id ?? '?').handle),
      destroy: () => Promise.resolve(),
    }) as unknown as Engine;

  it('destroy closes READY and LOCKED handles — the leak that started all this', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const ready = makeHandle('ready-doc');
    const locked = makeHandle('locked-doc', {
      security: {
        passwordPrompt: { state: 'required', hint: null },
        unlock: () => Promise.resolve({}),
      },
    });
    const openReady = kernel.documents.open(bytesInput('ready-doc'));
    const openLocked = kernel.documents.open(bytesInput('locked-doc'), { activate: false });
    resolve('ready-doc', ready.handle);
    resolve('locked-doc', locked.handle);
    await Promise.all([openReady, openLocked]);

    await kernel.destroy();
    expect(ready.close).toHaveBeenCalledTimes(1);
    expect(locked.close).toHaveBeenCalledTimes(1);
    expect(kernel.status()).toBe('destroyed');
  });

  it('destroy is idempotent (same promise) and start()/open() afterwards fail clearly', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [], report: () => {} });
    const first = kernel.destroy();
    expect(kernel.destroy()).toBe(first);
    await first;

    await expect(kernel.start()).rejects.toThrow(/destroyed kernel/);
    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow(/destroyed kernel/);
    expect(() => kernel.capability({ name: 'anything' })).toThrow(/destroyed kernel/);
    expect(kernel.tryCapability({ name: 'anything' })).toBeNull(); // reads stay total
    expect(kernel.documents.list()).toEqual([]); // reads stay legal
  });

  it('destroy during start joins it: effects never run, workspace unwinds', async () => {
    const initGate = gate();
    const effectsRan = vi.fn();
    const teardown = vi.fn();
    const plugin: AnyPlugin = {
      id: 'slow-ws',
      init: async (ctx: PluginContext<unknown>) => {
        ctx.cleanup(teardown);
        await initGate.promise;
      },
      effects: effectsRan,
    };
    const kernel = createKernel({ engine: instantEngine(), plugins: [plugin], report: () => {} });
    const start = kernel.start();
    const destroy = kernel.destroy();
    initGate.open();
    await destroy;

    expect(effectsRan).not.toHaveBeenCalled(); // the status check stopped the loop
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(kernel.status()).toBe('destroyed');
    await start; // start resolves (stopped early), never rejects here
  });

  it('a workspace init failure fails the kernel and unwinds what start registered', async () => {
    const teardown = vi.fn();
    const good: AnyPlugin = {
      id: 'good',
      init: (ctx: PluginContext<unknown>) => {
        ctx.cleanup(teardown);
      },
    };
    const bad: AnyPlugin = {
      id: 'bad',
      init: () => Promise.reject(new Error('workspace init exploded')),
    };
    const kernel = createKernel({
      engine: instantEngine(),
      plugins: [good, bad],
      report: () => {},
    });

    await expect(kernel.start()).rejects.toThrow('workspace init exploded');
    expect(kernel.status()).toBe('failed');
    expect(teardown).toHaveBeenCalledTimes(1); // rollback, not a limbo 'starting'
    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow(/failed kernel/);
    await kernel.destroy(); // destroy from failed is legal and quiet
    expect(kernel.status()).toBe('destroyed');
  });

  it('start is idempotent: a second call joins the first', async () => {
    const initCount = vi.fn();
    const plugin: AnyPlugin = { id: 'once', init: initCount };
    const kernel = createKernel({ engine: instantEngine(), plugins: [plugin], report: () => {} });
    await Promise.all([kernel.start(), kernel.start()]);
    expect(initCount).toHaveBeenCalledTimes(1);
  });

  it('concurrent close and destroy join the same teardown: the handle closes once', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [], report: () => {} });
    const { handle, close } = makeHandle('a');
    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', handle);
    await open;

    await Promise.all([kernel.documents.close('a'), kernel.destroy()]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(kernel.status()).toBe('destroyed');
  });

  it('the StrictMode script: destroyed kernel stays dead; a fresh kernel has exactly one effects pass', async () => {
    const pokes: string[] = [];
    const makePlugin = (tag: string): AnyPlugin => ({
      id: 'ws-effects',
      effects: (ctx: EffectContext<unknown>) => {
        ctx.onAction('poke', () => pokes.push(tag));
      },
      capability: (ctx) => ({ poke: () => ctx.dispatch({ type: 'poke' }) }),
      token: { name: 'poker' },
    });

    // Mount 1: start, then destroy before boot finishes (StrictMode cleanup).
    const k1 = createKernel({
      engine: instantEngine(),
      plugins: [makePlugin('k1')],
      report: () => {},
    });
    void k1.start();
    await k1.destroy();
    await expect(k1.start()).rejects.toThrow(/destroyed kernel/); // no zombie restart

    // Mount 2: a fresh kernel — the StrictMode survivor.
    const k2Plugin = makePlugin('k2');
    const k2 = createKernel({ engine: instantEngine(), plugins: [k2Plugin], report: () => {} });
    await k2.start();
    k2.capability<{ poke: () => void }>(k2Plugin.token as never).poke();
    expect(pokes).toEqual(['k2']); // exactly one listener — no duplicated effects
    await k2.destroy();
  });
});

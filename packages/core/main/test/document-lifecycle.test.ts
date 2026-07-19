import { describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import type { AnyPlugin } from '../src/types';

/**
 * Request-time document lifecycle: `open()` reserves the tab slot (id, order
 * position, activation) synchronously; content arrives at completion time.
 * These tests pin the guarantees the tab bar is built on:
 *
 *   - tabs exist immediately and keep REQUEST order under any completion order
 *   - activation is decided at request time (no focus stealing by slow docs)
 *   - a closed-while-loading document disposes its handle and leaves nothing
 *   - a failed open parks the tab in `error` (closable), not a vanished tab
 *   - a password-required open parks in `locked`; unlock() promotes to ready
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
function page(pon: number, index: number): PageLayout {
  return {
    index,
    pageObjectNumber: pon,
    label: null,
    size: { width: 600, height: 800 },
    rotation: 0,
    userUnit: 1,
    boxes: { media: { ...box }, crop: { ...box } },
  };
}

interface HandleOptions {
  security?: unknown;
  pages?: PageLayout[];
}

function makeHandle(id: string, opts: HandleOptions = {}): DocumentHandle {
  const pages = opts.pages ?? [page(1, 0)];
  return {
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: pages.length, pages }) },
    security: opts.security,
    close: vi.fn(() => Promise.resolve()),
  } as unknown as DocumentHandle;
}

/** An engine whose per-document open resolution the test controls. */
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
    resolve: (id: string, handle = makeHandle(id)) => {
      waiting.get(id)!.resolve(handle);
      waiting.delete(id);
      return handle;
    },
    reject: (id: string, error: unknown) => {
      waiting.get(id)!.reject(error);
      waiting.delete(id);
    },
    isWaiting: (id: string) => waiting.has(id),
  };
}

const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('kernel: request-time tab slots', () => {
  it('reserves all tabs synchronously, in request order', () => {
    const { engine } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });

    void kernel.documents.open(bytesInput('a')).catch(() => {});
    void kernel.documents.open(bytesInput('b'), { activate: false }).catch(() => {});
    void kernel.documents.open(bytesInput('c'), { activate: false }).catch(() => {});

    // No engine resolution yet — but every tab already exists.
    const docs = kernel.documents.list();
    expect(docs.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(docs.map((d) => d.status)).toEqual(['loading', 'loading', 'loading']);
    expect(kernel.documents.activeId()).toBe('a');
  });

  it('keeps request order under ANY completion order', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });

    const opens = [
      kernel.documents.open(bytesInput('a')),
      kernel.documents.open(bytesInput('b'), { activate: false }),
      kernel.documents.open(bytesInput('c'), { activate: false }),
    ];
    resolve('c');
    resolve('a');
    resolve('b');
    await Promise.all(opens);

    const docs = kernel.documents.list();
    expect(docs.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(docs.map((d) => d.status)).toEqual(['ready', 'ready', 'ready']);
    expect(kernel.documents.activeId()).toBe('a');
  });

  it('activation is decided at request time and slow docs never steal focus', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });

    const opens = [
      kernel.documents.open(bytesInput('a'), { activate: false }),
      kernel.documents.open(bytesInput('b'), { activate: true }),
      kernel.documents.open(bytesInput('c'), { activate: false }),
    ];
    // First open activates regardless (no active doc yet), then b claims it.
    expect(kernel.documents.activeId()).toBe('b');
    resolve('c'); // c finishing first must not grab the active tab
    await settle();
    expect(kernel.documents.activeId()).toBe('b');
    resolve('a');
    resolve('b');
    await Promise.all(opens);
    expect(kernel.documents.activeId()).toBe('b');
  });

  it('imperative open() defaults to activating the new tab', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    const first = kernel.documents.open(bytesInput('a'));
    resolve('a');
    await first;

    const second = kernel.documents.open(bytesInput('b'));
    expect(kernel.documents.activeId()).toBe('b'); // selected at request time
    resolve('b');
    await second;
    expect(kernel.documents.activeId()).toBe('b');
  });

  it('a pending tab is selectable via setActive', () => {
    const { engine } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    void kernel.documents.open(bytesInput('a')).catch(() => {});
    void kernel.documents.open(bytesInput('b'), { activate: false }).catch(() => {});

    kernel.documents.setActive('b');
    expect(kernel.documents.activeId()).toBe('b');
  });

  it('closing a loading tab removes it and disposes the late handle', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    const open = kernel.documents.open(bytesInput('a'));
    await kernel.documents.close('a');
    expect(kernel.documents.list()).toEqual([]);

    const handle = makeHandle('a');
    resolve('a', handle);
    await expect(open).rejects.toThrow(/closed while opening/);
    expect(handle.close).toHaveBeenCalled();
    expect(kernel.documents.list()).toEqual([]);
  });

  it('a failed open parks the tab in error, keeping its slot; close removes it', async () => {
    const { engine, resolve, reject } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    const openA = kernel.documents.open(bytesInput('a'));
    const openB = kernel.documents.open(bytesInput('b'), { activate: false });
    reject('a', new Error('corrupt file'));
    await expect(openA).rejects.toThrow('corrupt file');
    resolve('b');
    await openB;

    const docs = kernel.documents.list();
    expect(docs.map((d) => [d.id, d.status])).toEqual([
      ['a', 'error'],
      ['b', 'ready'],
    ]);

    await kernel.documents.close('a');
    expect(kernel.documents.list().map((d) => d.id)).toEqual(['b']);
  });

  it('a thunk source reserves its slot immediately and reconciles the id', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });

    let fetchNow!: () => void;
    const fetched = new Promise<void>((r) => (fetchNow = r));
    const open = kernel.documents.open(() => fetched.then(() => bytesInput('real-id')), {
      name: 'Slow fetch',
    });

    // Slot exists during the fetch, under a ticket id, with its name.
    expect(kernel.documents.list()).toHaveLength(1);
    expect(kernel.documents.list()[0].name).toBe('Slow fetch');
    expect(kernel.documents.list()[0].status).toBe('loading');

    fetchNow();
    await settle();
    resolve('real-id');
    const id = await open;
    expect(id).toBe('real-id');
    expect(kernel.documents.list().map((d) => [d.id, d.status])).toEqual([['real-id', 'ready']]);
    expect(kernel.documents.activeId()).toBe('real-id');
  });
});

describe('kernel: locked documents (password)', () => {
  function lockedSecurity(correctPassword: string) {
    let unlocked = false;
    return {
      get passwordPrompt() {
        return unlocked ? { state: 'none' as const } : { state: 'required' as const, hint: null };
      },
      unlock: vi.fn(({ password }: { password: string }) => {
        if (password !== correctPassword) return Promise.reject(new Error('incorrect password'));
        unlocked = true;
        return Promise.resolve({});
      }),
    };
  }

  it('a password-required open parks the tab as locked; unlock promotes it', async () => {
    const { engine, resolve } = controllableEngine();
    const initSpy = vi.fn();
    const docPlugin: AnyPlugin = { id: 'capture', scope: 'document', init: initSpy };
    const kernel = createKernel({ engine, plugins: [docPlugin] });

    const open = kernel.documents.open(bytesInput('a'), { name: 'Protected' });
    const security = lockedSecurity('hunter2');
    resolve('a', makeHandle('a', { security }));
    await open;

    expect(kernel.documents.list().map((d) => [d.id, d.status])).toEqual([['a', 'locked']]);
    expect(initSpy).not.toHaveBeenCalled(); // plugins never see a locked doc

    // Wrong password: rejects, stays locked, retryable.
    await expect(kernel.documents.unlock('a', { password: 'nope' })).rejects.toThrow(/incorrect/);
    expect(kernel.documents.get('a')!.status).toBe('locked');

    await kernel.documents.unlock('a', { password: 'hunter2' });
    expect(kernel.documents.get('a')!.status).toBe('ready');
    expect(kernel.documents.get('a')!.pageCount).toBe(1);
    expect(initSpy).toHaveBeenCalledTimes(1); // the normal lifecycle, just later
  });

  it('flags passwordProvided when a supplied password was rejected at open', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    const open = kernel.documents.open(bytesInput('a'), { password: 'wrong-guess' });
    resolve('a', makeHandle('a', { security: lockedSecurity('hunter2') }));
    await open;

    expect(kernel.documents.get('a')!.status).toBe('locked');
    expect(kernel.documents.get('a')!.passwordProvided).toBe(true);
  });

  it('document-scoped capabilities fail cleanly against a locked doc', async () => {
    const { engine, resolve } = controllableEngine();
    const token = { name: 'stage' };
    const docPlugin: AnyPlugin = {
      id: 'stage',
      scope: 'document',
      token,
      capability: () => ({}),
    };
    const kernel = createKernel({ engine, plugins: [docPlugin] });
    const open = kernel.documents.open(bytesInput('a'));
    resolve('a', makeHandle('a', { security: lockedSecurity('pw') }));
    await open;

    expect(() => kernel.capability(token, 'a')).toThrow(/is locked/);
  });

  it('closing a locked tab disposes the parked handle', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    const open = kernel.documents.open(bytesInput('a'));
    const handle = makeHandle('a', { security: lockedSecurity('pw') });
    resolve('a', handle);
    await open;

    await kernel.documents.close('a');
    expect(handle.close).toHaveBeenCalled();
    expect(kernel.documents.list()).toEqual([]);
    expect(kernel.documents.activeId()).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import type { AnyPlugin, EffectContext, PluginContext } from '../src/types';

/**
 * Characterization tests written BEFORE the lifecycle refactor (sessions +
 * transactional open). They pin behavior the refactor must preserve that the
 * other suites don't cover: activation handoff on close, duplicate-open
 * rejection, what plugin code observes during init/effects, and per-document
 * capability identity.
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

function makeHandle(id: string): DocumentHandle {
  return {
    id,
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page(1, 0)] }) },
    close: vi.fn(() => Promise.resolve()),
  } as unknown as DocumentHandle;
}

const instantEngine = () =>
  ({
    open: (input: { id?: string }) => Promise.resolve(makeHandle(input.id ?? '?')),
    destroy: () => Promise.resolve(),
  }) as unknown as Engine;

const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });

describe('characterization: activation handoff on close', () => {
  it('closing the active tab activates its left neighbor', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    await kernel.documents.open(bytesInput('c'));
    expect(kernel.documents.activeId()).toBe('c');

    await kernel.documents.close('c');
    expect(kernel.documents.activeId()).toBe('b');
    await kernel.documents.close('b');
    expect(kernel.documents.activeId()).toBe('a');
    await kernel.documents.close('a');
    expect(kernel.documents.activeId()).toBeNull();
  });

  it('closing an INACTIVE tab never moves the active tab', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');

    await kernel.documents.close('b');
    expect(kernel.documents.activeId()).toBe('a');
  });

  it('closing the first (active) of three activates the new first', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'), { activate: false });
    await kernel.documents.open(bytesInput('c'), { activate: false });
    expect(kernel.documents.activeId()).toBe('a');

    await kernel.documents.close('a');
    expect(kernel.documents.activeId()).toBe('b');
  });
});

describe('characterization: duplicate opens', () => {
  it('opening an id that is already open rejects and leaves the original intact', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));

    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow(/already open/);
    expect(kernel.documents.list().map((d) => [d.id, d.status])).toEqual([['a', 'ready']]);
  });

  it('an error tab keeps its id: re-opening it rejects until it is closed', async () => {
    const failingEngine = {
      open: () => Promise.reject(new Error('corrupt file')),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine: failingEngine, plugins: [] });
    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow('corrupt file');
    expect(kernel.documents.get('a')!.status).toBe('error');

    // Retry policy: the error slot occupies the id. close() first, then reopen.
    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow(/already open/);
    await kernel.documents.close('a');
    expect(kernel.documents.get('a')).toBeNull();
  });
});

describe('characterization: what plugin code observes', () => {
  it('ctx.document() and ctx.doc are live during a document plugin init', async () => {
    let sawMeta: unknown = null;
    let sawHandle: unknown = null;
    const plugin: AnyPlugin = {
      id: 'probe',
      scope: 'document',
      init: (ctx: PluginContext<unknown>) => {
        sawMeta = ctx.document();
        sawHandle = ctx.doc;
      },
    };
    const kernel = createKernel({ engine: instantEngine(), plugins: [plugin] });
    await kernel.documents.open(bytesInput('a'));

    expect(sawMeta).toMatchObject({ id: 'a', pageCount: 1 });
    expect(sawHandle).not.toBeNull();
  });

  it('document effects: watch fires on slice dispatch and stops after close', async () => {
    const seen: number[] = [];
    const counterToken = { name: 'counter' };
    const plugin: AnyPlugin = {
      id: 'counter',
      scope: 'document',
      initialState: { n: 0 },
      reduce: (s: { n: number }, a) => (a.type === 'inc' ? { n: s.n + 1 } : s),
      effects: (ctx: EffectContext<{ n: number }>) => {
        ctx.watch(
          () => ctx.getState().n,
          (n) => seen.push(n),
        );
        ctx.cleanup(() => seen.push(-1));
      },
      capability: (ctx) => ({ inc: () => ctx.dispatch({ type: 'inc' }) }),
      token: counterToken,
    };
    const kernel = createKernel({ engine: instantEngine(), plugins: [plugin] });
    const id = await kernel.documents.open(bytesInput('a'));

    kernel.capability<{ inc: () => void }>(counterToken as never, id).inc();
    expect(seen).toEqual([1]);

    await kernel.documents.close(id);
    expect(seen).toEqual([1, -1]); // cleanup ran; watch unsubscribed
  });

  it('capability instances are per document and torn down with their document', async () => {
    const token = { name: 'stage' };
    const plugin: AnyPlugin = {
      id: 'stage',
      scope: 'document',
      token,
      capability: (ctx: PluginContext<unknown>) => ({ boundTo: ctx.documentId }),
    };
    const kernel = createKernel({ engine: instantEngine(), plugins: [plugin] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));

    const capA = kernel.capability<{ boundTo: string }>(token as never, 'a');
    const capB = kernel.capability<{ boundTo: string }>(token as never, 'b');
    expect(capA.boundTo).toBe('a');
    expect(capB.boundTo).toBe('b');
    expect(capA).not.toBe(capB);
    expect(kernel.capability(token as never, 'a')).toBe(capA); // cached per (plugin, doc)

    await kernel.documents.close('a');
    expect(kernel.tryCapability(token as never, 'a')).toBeNull();
    expect(kernel.tryCapability(token as never, 'b')).toBe(capB); // untouched
  });

  it('closeAll closes every tab, in order, and clears activation', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));

    await kernel.documents.closeAll();
    expect(kernel.documents.list()).toEqual([]);
    expect(kernel.documents.activeId()).toBeNull();
    expect(kernel.documents.count()).toBe(0);
  });
});

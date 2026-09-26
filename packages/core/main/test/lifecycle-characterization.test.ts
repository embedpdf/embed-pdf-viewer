import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import type { AnyPlugin, PluginContext } from '../src/types';

/**
 * The document lifecycle as plugin code and adapters observe it: activation
 * handoff on close, duplicate-open rejection, what plugin code sees while it
 * is created and connected, and per-document capability identity.
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
const page = (pageObjectNumber: number, index: number): PageLayout => ({
  index,
  ref: toPageRef(pageObjectNumber),
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
    expect(kernel.documents.getActiveId()).toBe('c');

    await kernel.documents.close('c');
    expect(kernel.documents.getActiveId()).toBe('b');
    await kernel.documents.close('b');
    expect(kernel.documents.getActiveId()).toBe('a');
    await kernel.documents.close('a');
    expect(kernel.documents.getActiveId()).toBeNull();
  });

  it('closing an INACTIVE tab never moves the active tab', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');

    await kernel.documents.close('b');
    expect(kernel.documents.getActiveId()).toBe('a');
  });

  it('closing the first (active) of three activates the new first', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'), { activate: false });
    await kernel.documents.open(bytesInput('c'), { activate: false });
    expect(kernel.documents.getActiveId()).toBe('a');

    await kernel.documents.close('a');
    expect(kernel.documents.getActiveId()).toBe('b');
  });
});

describe('characterization: duplicate opens', () => {
  it('opening an id that is already open rejects and leaves the original intact', async () => {
    const kernel = createKernel({ engine: instantEngine(), plugins: [] });
    await kernel.documents.open(bytesInput('a'));

    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow(/already open/);
    expect(
      kernel.documents.list().map((documentInfo) => [documentInfo.id, documentInfo.status]),
    ).toEqual([['a', 'ready']]);
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
  it('ctx.document() and ctx.doc are live while a document plugin is created', async () => {
    let sawMeta: unknown = null;
    let sawHandle: unknown = null;
    const plugin: AnyPlugin = {
      id: 'probe',
      scope: 'document',
      create: (ctx: PluginContext<unknown>) => {
        sawMeta = ctx.document();
        sawHandle = ctx.doc;
        return { api: {} };
      },
    };
    const kernel = createKernel({ engine: instantEngine(), plugins: [plugin] });
    await kernel.documents.open(bytesInput('a'));

    expect(sawMeta).toMatchObject({ id: 'a', pageCount: 1 });
    expect(sawHandle).not.toBeNull();
  });

  it('a watch set up in connect fires on state updates and stops after close', async () => {
    const seen: number[] = [];
    const counterToken = { name: 'counter' };
    const increment = (state: { count: number }) => ({ count: state.count + 1 });
    const plugin: AnyPlugin = {
      id: 'counter',
      scope: 'document',
      state: () => ({ count: 0 }),
      create: (ctx: PluginContext<{ count: number }>) => ({
        api: { inc: () => ctx.state.update(increment) },
        connect: () => {
          ctx.watch(
            () => ctx.state.get().count,
            (count) => seen.push(count),
          );
          ctx.cleanup(() => {
            seen.push(-1);
          });
        },
      }),
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
      create: (ctx: PluginContext<unknown>) => ({ api: { boundTo: ctx.documentId } }),
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
    expect(kernel.documents.getActiveId()).toBeNull();
    expect(kernel.documents.getCount()).toBe(0);
  });
});

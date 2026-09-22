import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '../src/kernel';
import { bytesInput, immediateEngine, makeHandle, page } from './helpers';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';

/** Phase 3 step 1: the documents capability's events and its new verbs. */
describe('documents · lifecycle events', () => {
  it('emits opened, activeChanged, pagesChanged and closed in order', async () => {
    const handle = makeHandle('a', [page(1, 0), page(2, 1)]);
    const kernel = createKernel({
      engine: immediateEngine({ a: handle, b: makeHandle('b') }),
      plugins: [],
    });
    await kernel.start();
    const log: string[] = [];
    const { documents } = kernel;
    documents.onOpened((e) => log.push(`opened:${e.documentId}:${e.info.pageCount}`));
    documents.onActiveChanged((e) => log.push(`active:${e.previousDocumentId}->${e.documentId}`));
    documents.onPagesChanged((e) =>
      log.push(`pages:${e.documentId}:${e.revision}:${e.pages.length}`),
    );
    documents.onClosed((e) => log.push(`closed:${e.documentId}`));

    await documents.open(bytesInput('a'));
    await documents.open(bytesInput('b'));
    (handle.events as unknown as { emit(e: unknown): void }).emit({
      type: 'pages.rotated',
      layout: { pageCount: 2, pages: [page(1, 0), page(2, 1)] },
    });
    documents.setActive('a');
    await documents.close('a');

    expect(log).toEqual([
      'active:null->a',
      'opened:a:2',
      'active:a->b',
      'opened:b:1',
      'pages:a:1:2',
      'active:b->a',
      'active:a->b', // closing the active tab selects the neighbour before the closed event
      'closed:a',
    ]);
    expect(documents.getActive()?.id).toBe('b');
    await kernel.destroy();
  });

  it('projects a failed open as DocInfo.error with the plugin vocabulary, and retry() re-runs it', async () => {
    let attempts = 0;
    const engine = {
      open: () =>
        ++attempts === 1
          ? Promise.reject(new Error('network down'))
          : Promise.resolve(makeHandle('a')),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    await kernel.start();
    const failed = vi.fn();
    kernel.documents.onOpenFailed(failed);
    await expect(kernel.documents.open(bytesInput('a'))).rejects.toThrow('network down');
    expect(kernel.documents.get('a')).toMatchObject({
      status: 'error',
      error: { code: 'operation-failed', message: 'network down' },
    });
    expect(failed).toHaveBeenCalledTimes(1);

    await expect(kernel.documents.retry('a')).resolves.toBe('a');
    expect(kernel.documents.get('a')?.status).toBe('ready');
    await expect(kernel.documents.retry('a')).rejects.toThrow(/not a failed open/);
    await kernel.destroy();
  });

  it('rename, setOrder, getOrder, getCount and a reference-stable list', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    await kernel.start();
    const { documents } = kernel;
    await documents.open(bytesInput('a'));
    await documents.open(bytesInput('b'));
    const before = documents.list();
    expect(documents.list()).toBe(before); // memoised
    documents.rename('a', 'Alpha');
    expect(documents.get('a')?.name).toBe('Alpha');
    expect(documents.list()).not.toBe(before);
    expect(documents.getCount()).toBe(2);
    documents.setOrder(['b', 'a']);
    expect(documents.getOrder()).toEqual(['b', 'a']);
    expect(() => documents.setOrder(['b'])).toThrow(/permutation/);
    await kernel.destroy();
  });

  it('openAll returns the reserved ids', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [] });
    await kernel.start();
    const ids = kernel.documents.openAll([
      { source: bytesInput('x') },
      { source: bytesInput('y'), active: true },
    ]);
    expect(ids).toEqual(['x', 'y']);
    await new Promise((r) => setTimeout(r, 0));
    expect(kernel.documents.getActiveId()).toBe('y');
    await kernel.destroy();
  });

  it('emits locked when a document parks on a password', async () => {
    const lockedHandle = {
      ...makeHandle('l'),
      security: { passwordPrompt: { state: 'required' }, allows: () => true },
    } as unknown as DocumentHandle;
    const kernel = createKernel({ engine: immediateEngine({ l: lockedHandle }), plugins: [] });
    await kernel.start();
    const locked = vi.fn();
    kernel.documents.onLocked(locked);
    await kernel.documents.open(bytesInput('l'));
    expect(locked).toHaveBeenCalledWith({ documentId: 'l', passwordProvided: false });
    expect(kernel.documents.get('l')?.status).toBe('locked');
    await kernel.destroy();
  });
});

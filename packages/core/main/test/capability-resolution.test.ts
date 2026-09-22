import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import type { AnyPlugin } from '../src/types';

/**
 * `tryCapability` + `documents.openAll` — resolution and boot policy owned by
 * the kernel, so framework adapters never re-derive them:
 *
 *   - tryCapability is total (null, never throws) and reference-stable, so an
 *     adapter can expose it as a plain equality-cached reactive read. The
 *     null→instance flip at promote time is the re-render signal — no adapter
 *     may need to know when resolution changes.
 *   - openAll is the boot policy (order, single activation, failure
 *     containment) stated once, kernel-side.
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
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
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
    resolve: (id: string) => {
      waiting.get(id)!.resolve(makeHandle(id));
      waiting.delete(id);
    },
    reject: (id: string, error: unknown) => {
      waiting.get(id)!.reject(error);
      waiting.delete(id);
    },
  };
}

const bytesInput = (id: string) => ({ kind: 'bytes' as const, id, bytes: new Uint8Array() });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const docToken = { name: 'stage' };
const docPlugin: AnyPlugin = {
  id: 'stage',
  scope: 'document',
  token: docToken,
  create: () => ({ api: {} }),
};
const wsToken = { name: 'shell' };
const wsPlugin: AnyPlugin = { id: 'shell', token: wsToken, create: () => ({ api: { ws: true } }) };

describe('kernel: tryCapability', () => {
  it('is null while pending, reference-stable once ready, null again after close', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [docPlugin, wsPlugin] });

    expect(kernel.tryCapability(wsToken)).not.toBeNull(); // workspace: resolvable always
    expect(kernel.tryCapability(docToken)).toBeNull(); // no document at all

    const open = kernel.documents.open(bytesInput('a'));
    expect(kernel.tryCapability(docToken)).toBeNull(); // loading — no plugin instances yet
    expect(kernel.tryCapability(docToken, 'a')).toBeNull(); // explicit id, same rule

    resolve('a');
    await open;
    const cap = kernel.tryCapability(docToken);
    expect(cap).not.toBeNull(); // the promote flip — what re-renders adapter chrome
    expect(kernel.tryCapability(docToken, 'a')).toBe(cap); // reference-stable

    await kernel.documents.close('a');
    expect(kernel.tryCapability(docToken)).toBeNull();
  });

  it('is null (not a throw) for a token no plugin provides', () => {
    const { engine } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });
    expect(kernel.tryCapability({ name: 'nobody' })).toBeNull();
    expect(() => kernel.capability({ name: 'nobody' })).toThrow(/No capability/); // strict stays strict
  });
});

describe('kernel: documents.openAll', () => {
  it('reserves every slot synchronously and selects the `active` entry', async () => {
    const { engine, resolve } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });

    kernel.documents.openAll([
      { source: bytesInput('a') },
      { source: bytesInput('b'), active: true },
      { source: bytesInput('c') },
    ]);
    expect(kernel.documents.list().map((documentInfo) => documentInfo.id)).toEqual(['a', 'b', 'c']);
    expect(kernel.documents.getActiveId()).toBe('b');

    resolve('c'); // completion order must change nothing
    resolve('a');
    resolve('b');
    await settle();
    expect(kernel.documents.list().map((documentInfo) => documentInfo.status)).toEqual([
      'ready',
      'ready',
      'ready',
    ]);
    expect(kernel.documents.getActiveId()).toBe('b');
  });

  it('defaults to the first tab; one failure never disturbs its siblings', async () => {
    const { engine, resolve, reject } = controllableEngine();
    const kernel = createKernel({ engine, plugins: [] });

    kernel.documents.openAll([{ source: bytesInput('a') }, { source: bytesInput('b') }]);
    expect(kernel.documents.getActiveId()).toBe('a');

    reject('b', new Error('boom')); // contained: openAll never surfaces a rejection
    resolve('a');
    await settle();
    expect(
      kernel.documents.list().map((documentInfo) => [documentInfo.id, documentInfo.status]),
    ).toEqual([
      ['a', 'ready'],
      ['b', 'error'],
    ]);
    expect(kernel.documents.getActiveId()).toBe('a');
  });
});

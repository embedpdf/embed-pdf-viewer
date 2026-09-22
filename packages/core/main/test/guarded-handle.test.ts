import { describe, expect, it, vi } from 'vitest';
import { AbortablePromise, EngineError, PermissionDenied } from '@embedpdf/engine-core/runtime';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';
import { guardHandle } from '../src/guarded-handle';
import { isPluginError } from '../src/errors';

/** The guarded `ctx.doc`: lifetime and error vocabulary, invisible to the caller. */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (event: unknown) => void;
  const promise = new Promise<T>((result, rej) => {
    resolve = result;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeHandle() {
  const read = deferred<string>();
  const abort = vi.fn();
  const abortableCall = new AbortablePromise<number>((resolve, _reject, _progress, signal) => {
    signal.addEventListener('abort', () => abort());
    setTimeout(() => resolve(42), 50);
  });
  const handle = {
    id: 'd',
    security: { allows: (cap: string) => cap === 'doc.read' },
    metadata: {
      read: () => read.promise,
      update: () => Promise.reject(new PermissionDenied('doc.metadata.modify')),
      fail: () => Promise.reject(new EngineError('NotFound', 'gone')),
      sync: () => {
        throw new EngineError('InvalidArg', 'bad');
      },
    },
    pages: { list: () => abortableCall },
    page: (ref: { pageObjectNumber: number }) => ({
      ref,
      render: { image: () => Promise.resolve('img') },
    }),
  } as unknown as DocumentHandle;
  return { handle, read, abort };
}

describe('guardHandle', () => {
  it('passes values through while the instance is live, with the raw target as `this`', async () => {
    const { handle, read } = fakeHandle();
    const controller = new AbortController();
    const doc = guardHandle(handle, { signal: controller.signal, instanceId: 'd#1' }, 'test');
    expect(doc.security.allows('doc.read' as never)).toBe(true); // sync passthrough
    const pending = doc.metadata.read();
    read.resolve('meta');
    await expect(pending).resolves.toBe('meta');
    // nested objects are wrapped lazily and cached
    const page = doc.page({ kind: 'objectNumber', pageObjectNumber: 3 });
    expect(doc.page({ kind: 'objectNumber', pageObjectNumber: 3 })).not.toBe(page); // new object each call from the fake
    await expect(page.render.image({} as never)).resolves.toBe('img');
  });

  it('rejects a pending call with instance-closed when the instance closes, and drops the late value', async () => {
    const { handle, read } = fakeHandle();
    const controller = new AbortController();
    const doc = guardHandle(handle, { signal: controller.signal, instanceId: 'd#1' }, 'test');
    const pending = doc.metadata.read();
    controller.abort('closed');
    await expect(pending).rejects.toSatisfy((error) => isPluginError(error, 'instance-closed'));
    read.resolve('late'); // must not surface anywhere
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('aborts an abortable engine call at close', async () => {
    const { handle, abort } = fakeHandle();
    const controller = new AbortController();
    const doc = guardHandle(handle, { signal: controller.signal, instanceId: 'd#1' }, 'test');
    const pending = doc.pages.list();
    controller.abort('closed');
    await expect(pending).rejects.toSatisfy((error) => isPluginError(error, 'instance-closed'));
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('refuses new calls after close', async () => {
    const { handle } = fakeHandle();
    const controller = new AbortController();
    controller.abort('closed');
    const doc = guardHandle(handle, { signal: controller.signal, instanceId: 'd#1' }, 'test');
    await expect(doc.metadata.read()).rejects.toSatisfy((error) =>
      isPluginError(error, 'instance-closed'),
    );
  });

  it('maps engine errors to the plugin vocabulary, sync and async', async () => {
    const { handle } = fakeHandle();
    const controller = new AbortController();
    const doc = guardHandle(
      handle,
      { signal: controller.signal, instanceId: 'd#1' },
      'test',
    ) as never as {
      metadata: { update(): Promise<unknown>; fail(): Promise<unknown>; sync(): unknown };
    };
    await expect(doc.metadata.update()).rejects.toSatisfy((error) =>
      isPluginError(error, 'permission-denied'),
    );
    await expect(doc.metadata.fail()).rejects.toSatisfy((error) =>
      isPluginError(error, 'not-found'),
    );
    expect(() => doc.metadata.sync()).toThrow(expect.objectContaining({ code: 'invalid-input' }));
  });

  it('keeps abort() on promises that had one', async () => {
    const { handle, abort } = fakeHandle();
    const controller = new AbortController();
    const doc = guardHandle(handle, { signal: controller.signal, instanceId: 'd#1' }, 'test');
    const pending = doc.pages.list() as Promise<unknown> & { abort?: (reason?: unknown) => void };
    expect(typeof pending.abort).toBe('function');
    pending.abort!('caller');
    expect(abort).toHaveBeenCalledTimes(1);
    await pending.catch(() => {});
  });
});

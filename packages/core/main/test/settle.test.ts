import { describe, expect, it, vi } from 'vitest';

import { createCapabilityToken } from '../src/index';
import { createKernel } from '../src/kernel';
import type { AnyPlugin, PluginContext } from '../src/types';
import { bytesInput, immediateEngine, makeHandle } from './helpers';

/**
 * Settling before a download: `documents.download()` first runs every plugin's `onSettle` flush, then
 * waits for the writes in the document's plugin queues, so the file has everything the user sees.
 */

interface HolderApi {
  /** A write through the plugin's queue, like a form value or a page edit. */
  write(operation: () => Promise<void>): Promise<void>;
}
const token = createCapabilityToken<HolderApi>('holder');

function holderPlugin(flush?: (signal: AbortSignal) => Promise<void> | void): AnyPlugin {
  return {
    id: 'holder',
    scope: 'document',
    token,
    create: (ctx: PluginContext<unknown>) => {
      if (flush) ctx.onSettle(flush);
      const queue = ctx.serialQueue('writes');
      // A download waits for the writes on their way.
      ctx.onSettle(() => queue.idle());
      return { api: { write: (operation) => queue(operation) } satisfies HolderApi };
    },
  };
}

/** A promise with its settle functions, for work the test finishes by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function openWith(
  plugins: AnyPlugin[],
  log: string[],
  options: { report?: (e: unknown) => void } = {},
) {
  const handle = Object.assign(makeHandle('d'), {
    download: vi.fn(async () => {
      log.push('download');
      return new Uint8Array([1]);
    }),
  });
  const kernel = createKernel({ engine: immediateEngine({ d: handle }), plugins, ...options });
  await kernel.start();
  await kernel.documents.open(bytesInput('d'));
  return { kernel, handle };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('settle before a download', () => {
  it('sends what a plugin holds back before the engine writes the file', async () => {
    const log: string[] = [];
    const typing = deferred();
    const { kernel } = await openWith(
      [
        holderPlugin(async () => {
          log.push('flush');
          await typing.promise;
          log.push('flushed');
        }),
      ],
      log,
    );

    const saving = kernel.documents.download('d');
    await tick();
    expect(log).toEqual(['flush']); // the file waits for the held-back text

    typing.resolve();
    await expect(saving).resolves.toEqual(new Uint8Array([1]));
    expect(log).toEqual(['flush', 'flushed', 'download']);
    await kernel.destroy();
  });

  it('waits for writes already on their way in a plugin queue', async () => {
    const log: string[] = [];
    const write = deferred();
    const { kernel } = await openWith([holderPlugin()], log);
    const holder = kernel.capability(token, 'd');

    void holder.write(async () => {
      await write.promise;
      log.push('written');
    });
    const saving = kernel.documents.download('d');
    await tick();
    expect(log).toEqual([]);

    write.resolve();
    await saving;
    expect(log).toEqual(['written', 'download']);
    await kernel.destroy();
  });

  it('still writes the file when a flush fails, and reports the failure', async () => {
    const log: string[] = [];
    const report = vi.fn();
    const failure = new Error('refused');
    const { kernel } = await openWith(
      [
        holderPlugin(() => {
          throw failure;
        }),
      ],
      log,
      { report },
    );

    await expect(kernel.documents.download('d')).resolves.toBeInstanceOf(Uint8Array);
    expect(log).toEqual(['download']);
    expect(report).toHaveBeenCalledWith(failure);
    await kernel.destroy();
  });

  it('stops waiting when the caller cancels, and never reads the file', async () => {
    const log: string[] = [];
    const { kernel, handle } = await openWith([holderPlugin(() => new Promise(() => {}))], log);
    const cancel = new AbortController();

    const saving = kernel.documents.download('d', { signal: cancel.signal });
    cancel.abort();
    await expect(saving).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(handle.download).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('stops waiting when the document closes', async () => {
    const log: string[] = [];
    const { kernel, handle } = await openWith([holderPlugin(() => new Promise(() => {}))], log);

    const saving = kernel.documents.download('d', { signal: new AbortController().signal });
    await tick();
    await kernel.documents.close('d');
    await expect(saving).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(handle.download).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('never waits for a queue that is not registered, so a queued verb can save from inside it', async () => {
    const log: string[] = [];
    const verbsToken = createCapabilityToken<{ runSave(): Promise<Uint8Array> }>('verbs');
    const verbs: AnyPlugin = {
      id: 'verbs',
      scope: 'document',
      token: verbsToken,
      create: (ctx: PluginContext<unknown>) => {
        const queue = ctx.serialQueue('verbs'); // carries verbs, not writes: not registered
        return {
          api: {
            runSave: () => queue(() => kernel.documents.download('d')),
          },
        };
      },
    };
    const { kernel } = await openWith([verbs], log);

    await expect(kernel.capability(verbsToken, 'd').runSave()).resolves.toBeInstanceOf(Uint8Array);
    expect(log).toEqual(['download']);
    await kernel.destroy();
  });

  it('is for document-scoped plugins only', () => {
    const workspace: AnyPlugin = {
      id: 'ws',
      create: (ctx: PluginContext<unknown>) => {
        ctx.onSettle(() => {});
        return { api: {} };
      },
    };
    // Workspace plugins are built with the kernel.
    expect(() => createKernel({ engine: immediateEngine(), plugins: [workspace] })).toThrow(
      /no document to settle/,
    );
  });
});

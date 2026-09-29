import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '../src/kernel';
import { createCapabilityToken } from '../src/index';
import { isPluginError } from '../src/errors';
import type { AnyPlugin, PluginContext } from '../src/types';
import { bytesInput, immediateEngine, makeHandle, page } from './helpers';
import { pageSpaceBoxesOf } from '@embedpdf/engine-core/runtime';

/**
 * The `create()` hook end to end: cheap eager construction in dependency
 * order, `connect` after every dependency exists, events disposed with the
 * instance, page lookups and page-ref checks bound to this document.
 */

interface Api {
  ping(): string;
  onPinged: ReturnType<PluginContext<unknown>['events']['source']>['on'];
  cropLeft(pageObjectNumber: number): number | null;
  check(pageObjectNumber: number): void;
  wait(): Promise<void>;
  bump(): void;
}
const token = createCapabilityToken<Api>('probe');
const bump = (state: { count: number }) => ({ count: state.count + 1 });

function probePlugin(log: string[]): AnyPlugin {
  return {
    id: 'probe',
    scope: 'document',
    token,
    state: () => ({ count: 0 }),
    create: (ctx: PluginContext<{ count: number }>) => {
      log.push(`create:${ctx.instanceId}`);
      const pinged = ctx.events.source<string>();
      const api: Api = {
        ping: () => (pinged.emit('ping'), 'pong'),
        onPinged: pinged.on,
        cropLeft: (pageObjectNumber) =>
          ctx.getPage({ kind: 'objectNumber', pageObjectNumber })?.pdfCropBox.left ?? null,
        check: (pageObjectNumber) => ctx.assertPageRef({ kind: 'objectNumber', pageObjectNumber }),
        wait: () => ctx.waitFor(() => ctx.state.get().count > 0),
        bump: () => ctx.state.update(bump),
      };
      return {
        api,
        connect: () => {
          log.push('connect');
          ctx.listen(ctx.doc.events as never, () => log.push('event'));
        },
      };
    },
  };
}

describe('create() controller hook', () => {
  it('constructs eagerly, connects after construction, and disposes events at close', async () => {
    const log: string[] = [];
    const cropped = {
      ...page(7, 0),
      boxes: pageSpaceBoxesOf({
        media: { left: 10, bottom: 20, right: 210, top: 320 },
        crop: { left: 10, bottom: 20, right: 210, top: 320 },
        bleed: { left: 10, bottom: 20, right: 210, top: 320 },
        trim: { left: 10, bottom: 20, right: 210, top: 320 },
        art: { left: 10, bottom: 20, right: 210, top: 320 },
      }),
      pdfCropBox: { left: 10, bottom: 20, right: 210, top: 320 },
    };
    const handle = makeHandle('d', [cropped]);
    const kernel = createKernel({
      engine: immediateEngine({ d: handle }),
      plugins: [probePlugin(log)],
    });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    expect(log).toEqual(['create:d#1', 'connect']);

    const api = kernel.capability(token, 'd');
    const listener = vi.fn();
    api.onPinged(listener);
    expect(api.ping()).toBe('pong');
    expect(listener).toHaveBeenCalledWith('ping');

    // pages are this document's
    expect(api.cropLeft(7)).toBe(10);
    expect(api.cropLeft(99)).toBeNull();
    expect(() => api.check(7)).not.toThrow();
    expect(() => api.check(99)).toThrow(expect.objectContaining({ code: 'not-found' }));

    // listen() subscriptions and event sources die with the instance
    (handle.events as unknown as { emit(error: unknown): void }).emit({ type: 'noop' });
    expect(log.filter((entry) => entry === 'event')).toHaveLength(1);
    await kernel.documents.close('d');
    (handle.events as unknown as { emit(error: unknown): void }).emit({ type: 'noop' });
    expect(log.filter((entry) => entry === 'event')).toHaveLength(1);
    api.ping();
    expect(listener).toHaveBeenCalledTimes(1); // source disposed
    await kernel.destroy();
  });

  it('waitFor resolves on a store change and rejects with instance-closed at close', async () => {
    const log: string[] = [];
    const kernel = createKernel({ engine: immediateEngine(), plugins: [probePlugin(log)] });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    const api = kernel.capability(token, 'd');
    const waiting = api.wait();
    api.bump();
    await expect(waiting).resolves.toBeUndefined();

    const waitingAtClose = api.wait();
    await kernel.documents.open(bytesInput('e'));
    const api2 = kernel.capability(token, 'e');
    const w2 = api2.wait();
    await kernel.documents.close('e');
    await expect(w2).rejects.toSatisfy((error) => isPluginError(error, 'instance-closed'));
    await expect(waitingAtClose).resolves.toBeUndefined(); // d's state already satisfied it
    await kernel.destroy();
  });

  it('a workspace controller cannot touch `doc` and its lifetime is the kernel’s', async () => {
    let captured: PluginContext<unknown> | null = null;
    const ws: AnyPlugin = {
      id: 'ws',
      token: createCapabilityToken<unknown>('ws'),
      create: (ctx: PluginContext<unknown>) => {
        captured = ctx;
        return { api: {} };
      },
    };
    const kernel = createKernel({ engine: immediateEngine(), plugins: [ws] });
    await kernel.start();
    expect(() => captured!.doc).toThrow(/has no bound document/);
    const lane = captured!.latest('x');
    await kernel.destroy();
    await expect(lane.run(async () => 1)).rejects.toSatisfy((error) =>
      isPluginError(error, 'instance-closed'),
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { AbortablePromise, EngineError } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import { createCapabilityToken } from '../src/index';
import type { AnyPlugin, PluginContext } from '../src/types';
import { immediateEngine } from './helpers';

/** `ctx.cancellable`: an engine call the caller can cancel with its signal. */

/** An engine call that waits until the test settles it, and records an abort. */
function engineCall<T>() {
  const aborted = vi.fn();
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const task = new AbortablePromise<T>((settle, fail, _progress, signal) => {
    resolve = settle;
    reject = fail;
    signal.addEventListener('abort', () => aborted());
  });
  return { task, resolve, reject, aborted };
}

async function workspaceContext() {
  let captured: PluginContext<unknown> | null = null;
  const plugin: AnyPlugin = {
    id: 'probe',
    token: createCapabilityToken<unknown>('probe'),
    create: (ctx: PluginContext<unknown>) => {
      captured = ctx;
      return { api: {} };
    },
  };
  const kernel = createKernel({ engine: immediateEngine(), plugins: [plugin] });
  await kernel.start();
  return { kernel, ctx: captured! as PluginContext<unknown> };
}

const cancelled = expect.objectContaining({ code: 'operation-cancelled', capability: 'probe' });

describe('ctx.cancellable', () => {
  it('a signal that already fired rejects at once and aborts the call', async () => {
    const { kernel, ctx } = await workspaceContext();
    const call = engineCall<number>();
    const controller = new AbortController();
    controller.abort();
    await expect(ctx.cancellable(controller.signal, call.task)).rejects.toEqual(cancelled);
    expect(call.aborted).toHaveBeenCalledOnce();
    await kernel.destroy();
  });

  it('a signal that fires during the call rejects without waiting for the engine', async () => {
    const { kernel, ctx } = await workspaceContext();
    const call = engineCall<number>();
    const controller = new AbortController();
    const running = ctx.cancellable(controller.signal, call.task);
    controller.abort();
    await expect(running).rejects.toEqual(cancelled);
    expect(call.aborted).toHaveBeenCalledOnce();
    call.resolve(42); // a late value goes nowhere
    await kernel.destroy();
  });

  it('a signal that fires after the call settled changes nothing', async () => {
    const { kernel, ctx } = await workspaceContext();
    const call = engineCall<number>();
    const controller = new AbortController();
    const running = ctx.cancellable(controller.signal, call.task);
    call.resolve(42);
    await expect(running).resolves.toBe(42);
    controller.abort();
    expect(call.aborted).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('a failing call rejects in the plugin vocabulary', async () => {
    const { kernel, ctx } = await workspaceContext();
    const call = engineCall<number>();
    const running = ctx.cancellable(new AbortController().signal, call.task);
    call.reject(new EngineError('NotFound', 'gone'));
    await expect(running).rejects.toMatchObject({ code: 'not-found', capability: 'probe' });
    await kernel.destroy();
  });

  it('without a signal the call is returned as it is', async () => {
    const { kernel, ctx } = await workspaceContext();
    const call = engineCall<number>();
    expect(ctx.cancellable(undefined, call.task)).toBe(call.task);
    call.resolve(1);
    await kernel.destroy();
  });
});

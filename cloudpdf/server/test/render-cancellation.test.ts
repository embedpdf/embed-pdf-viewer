/**
 * Work nobody waits for stops. A client that disconnects aborts its request's
 * signal, which the engine pool forwards to the worker, whose render stops at
 * its next slice. A render shared by several requests stops only once all of
 * them have left.
 */
import http from 'node:http';
import Fastify from 'fastify';
import { afterEach, describe, expect, test } from 'vitest';
import { AbortError } from '@embedpdf/engine-core/runtime';
import { abortSignalOf } from '../src/routes/_helpers';
import { DerivedRenderService } from '../src/services/DerivedRenderService';
import type { ObjectStore } from '../src/storage/ObjectStore';

describe('abortSignalOf', () => {
  const apps: Array<{ close(): Promise<unknown> }> = [];
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.close();
  });

  /** A server whose handler reports its signal before and after its reply. */
  async function server(opts: { handlerMs: number; preHandlerMs?: number }) {
    const seen: Array<{ during: boolean; after: boolean }> = [];
    const app = Fastify();
    apps.push(app);
    for (const method of ['GET', 'POST'] as const) {
      app.route({
        method,
        url: '/r',
        preHandler: async () => {
          if (opts.preHandlerMs) await new Promise((r) => setTimeout(r, opts.preHandlerMs));
        },
        handler: async (_req, reply) => {
          const signal = abortSignalOf(reply);
          await new Promise((r) => setTimeout(r, opts.handlerMs));
          const during = signal.aborted;
          setTimeout(() => seen.push({ during, after: signal.aborted }), 50);
          return 'ok';
        },
      });
    }
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    return { port, seen };
  }

  /** One request over a kept-alive connection, dropped after `dropMs` if given. */
  function call(port: number, method: 'GET' | 'POST', agent: http.Agent, dropMs?: number) {
    return new Promise<void>((done) => {
      const request = http.request(
        {
          port,
          host: '127.0.0.1',
          path: '/r',
          method,
          agent,
          headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
        },
        (res) => {
          res.resume();
          res.on('end', () => done());
        },
      );
      request.on('error', () => done());
      request.end(method === 'POST' ? '{}' : undefined);
      if (dropMs !== undefined) setTimeout(() => request.destroy(), dropMs);
    });
  }

  const settle = (seen: unknown[], count: number) =>
    new Promise<void>((resolve) => {
      const check = () => (seen.length >= count ? resolve() : setTimeout(check, 10));
      check();
    });

  test('never aborts a request whose reply is sent, on a kept-alive connection', async () => {
    const { port, seen } = await server({ handlerMs: 5 });
    const agent = new http.Agent({ keepAlive: true });
    for (const method of ['GET', 'POST'] as const) await call(port, method, agent);
    await settle(seen, 2);
    agent.destroy();
    expect(seen).toEqual([
      { during: false, after: false },
      { during: false, after: false },
    ]);
  });

  test('aborts when the client disconnects while the handler runs', async () => {
    const { port, seen } = await server({ handlerMs: 400 });
    const agent = new http.Agent({ keepAlive: true });
    for (const method of ['GET', 'POST'] as const) await call(port, method, agent, 100);
    await settle(seen, 2);
    agent.destroy();
    expect(seen).toEqual([
      { during: true, after: true },
      { during: true, after: true },
    ]);
  });

  test('aborts when the client left before the handler ran', async () => {
    const { port, seen } = await server({ handlerMs: 5, preHandlerMs: 300 });
    const agent = new http.Agent({ keepAlive: true });
    for (const method of ['GET', 'POST'] as const) await call(port, method, agent, 100);
    await settle(seen, 2);
    agent.destroy();
    expect(seen.every((entry) => entry.during)).toBe(true);
  });
});

describe('shared renders', () => {
  const storage = {
    get: async () => null,
    put: async () => undefined,
  } as unknown as ObjectStore;

  /** A render that ends when told to, or rejects when its signal aborts. */
  function pendingRender() {
    const renders: Array<{ signal: AbortSignal; finish: () => void }> = [];
    const produce = (signal: AbortSignal) =>
      new Promise<{ bytes: Uint8Array; contentType: string }>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new AbortError(signal.reason)));
        renders.push({
          signal,
          finish: () => resolve({ bytes: new Uint8Array([1]), contentType: 'image/webp' }),
        });
      });
    return { renders, produce };
  }

  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

  test('go on for the callers still waiting when one leaves', async () => {
    const service = new DerivedRenderService({ storage });
    const { renders, produce } = pendingRender();
    const leaving = new AbortController();
    const first = service.getOrRender('k', produce, leaving.signal);
    await tick();
    const second = service.getOrRender('k', produce, new AbortController().signal);
    await tick();

    leaving.abort();
    await expect(first).rejects.toBeInstanceOf(AbortError);
    expect(renders).toHaveLength(1);
    expect(renders[0]!.signal.aborted).toBe(false);

    renders[0]!.finish();
    expect((await second).source).toBe('produced');
  });

  test('stop once every caller has left, and start again for a later caller', async () => {
    const service = new DerivedRenderService({ storage });
    const { renders, produce } = pendingRender();
    const callers = [new AbortController(), new AbortController()];
    const results = callers.map((caller) => service.getOrRender('k', produce, caller.signal));
    await tick();
    await tick();
    for (const caller of callers) caller.abort();
    for (const result of results) await expect(result).rejects.toBeInstanceOf(AbortError);
    expect(renders).toHaveLength(1);
    expect(renders[0]!.signal.aborted).toBe(true);

    // The stopped render is not joined; a new caller gets a new render.
    const later = service.getOrRender('k', produce, new AbortController().signal);
    await tick();
    await tick();
    expect(renders).toHaveLength(2);
    renders[1]!.finish();
    expect((await later).source).toBe('produced');
  });

  test('never stop for a caller without a signal', async () => {
    const service = new DerivedRenderService({ storage });
    const { renders, produce } = pendingRender();
    const warm = service.getOrRender('k', produce);
    await tick();
    const leaving = new AbortController();
    const reader = service.getOrRender('k', produce, leaving.signal);
    await tick();
    leaving.abort();
    await expect(reader).rejects.toBeInstanceOf(AbortError);
    expect(renders[0]!.signal.aborted).toBe(false);
    renders[0]!.finish();
    expect((await warm).source).toBe('produced');
  });

  test('do not start for a caller that already left', async () => {
    const service = new DerivedRenderService({ storage });
    const { renders, produce } = pendingRender();
    const gone = new AbortController();
    gone.abort();
    await expect(service.getOrRender('k', produce, gone.signal)).rejects.toBeInstanceOf(AbortError);
    await tick();
    expect(renders).toHaveLength(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import {
  createCapabilityToken,
  definePlugin,
  reload,
  type Mirror,
  type MirrorChange,
} from '../src/index';
import { PluginError } from '../src/errors';
import { createTestContext } from '../src/testing';
import { bytesInput, immediateEngine, makeHandle } from './helpers';

/**
 * The mirror load protocol, one test per rule: subscribe first, load after
 * connect, queue and replay past the cursor, degrade on failure, reload on
 * resync events and throwing folds, coalesce reloads, respect `readable`,
 * and stop writing when the instance closes.
 */

type Records = Readonly<Record<string, string>>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const origin = (serverId: number | null, kind: 'local' | 'remote' = 'remote') => ({
  kind,
  sessionId: kind === 'local' ? 'me' : 'them',
  sub: null,
  ts: 0,
  serverId,
});
const upserted = (id: string, title: string, serverId: number | null = null) =>
  ({
    type: 'annotations.updated',
    record: { id, title },
    origin: origin(serverId),
  }) as unknown as DocumentEvent;
const deleted = (id: string, serverId: number | null = null) =>
  ({ type: 'annotations.deleted', id, origin: origin(serverId) }) as unknown as DocumentEvent;
const desynced = { type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 } as DocumentEvent;
const versioned = {
  type: 'document.versioned',
  version: {},
  origin: origin(null),
} as unknown as DocumentEvent;

const foldRecords = (value: Records, event: DocumentEvent): Records => {
  const raw = event as unknown as {
    type: string;
    record?: { id: string; title: string };
    id?: string;
  };
  if (raw.type === 'annotations.updated' && raw.record) {
    return { ...value, [raw.record.id]: raw.record.title };
  }
  if (raw.type === 'annotations.deleted' && raw.id && raw.id in value) {
    const { [raw.id]: _removed, ...rest } = value;
    return rest;
  }
  return value;
};

function setup(options: {
  loads?: Deferred<{ value: Records; cursor?: number | null }>[];
  readable?: () => boolean;
  fold?: (value: Records, event: DocumentEvent) => Records | ReturnType<typeof reload>;
  loadPages?: () => Promise<(value: Records) => Records>;
}) {
  const ctx = createTestContext({ id: 'probe' });
  const loads = options.loads ?? [];
  const load = vi.fn(() => {
    const next = loads.shift();
    if (!next) throw new Error('unexpected load');
    return next.promise;
  });
  const changes: MirrorChange<Records>[] = [];
  const mirror: Mirror<Records> = ctx.mirror<Records>({
    name: 'records',
    initial: () => ({}),
    readable: options.readable,
    load,
    fold: options.fold ?? foldRecords,
    loadPages: options.loadPages,
    changed: (change) => changes.push(change),
  });
  return { ctx, mirror, load, changes };
}

describe('ctx.mirror', () => {
  it('does not load before the plugin is connected, then loads once', async () => {
    const first = deferred<{ value: Records }>();
    const { ctx, mirror, load } = setup({ loads: [first] });
    expect(load).not.toHaveBeenCalled();
    expect(mirror.getStatus()).toBe('idle');
    ctx.connect({ api: null });
    expect(load).toHaveBeenCalledTimes(1);
    expect(mirror.getStatus()).toBe('loading');
    first.resolve({ value: { a: 'A' } });
    await settle();
    expect(mirror.get()).toEqual({ a: 'A' });
    expect(mirror.getStatus()).toBe('ready');
  });

  it('applies events from every origin with the same fold', async () => {
    const first = deferred<{ value: Records }>();
    const { ctx, mirror, changes } = setup({ loads: [first] });
    ctx.connect({ api: null });
    first.resolve({ value: {} });
    await settle();
    ctx.emitDocumentEvent(upserted('a', 'remote'));
    ctx.emitDocumentEvent({
      ...(upserted('b', 'local') as object),
      origin: origin(null, 'local'),
    } as DocumentEvent);
    expect(mirror.get()).toEqual({ a: 'remote', b: 'local' });
    expect(changes.map((change) => change.cause)).toEqual(['load', 'event', 'event']);
  });

  it('queues events during a load and replays only those past the cursor', async () => {
    const first = deferred<{ value: Records; cursor: number }>();
    const { ctx, mirror } = setup({ loads: [first] });
    ctx.connect({ api: null });
    ctx.emitDocumentEvent(upserted('a', 'already in the snapshot', 5));
    ctx.emitDocumentEvent(deleted('x', 7)); // deleted while the snapshot was in flight
    ctx.emitDocumentEvent(upserted('b', 'newer', 8));
    first.resolve({ value: { a: 'snapshot', x: 'stale' }, cursor: 6 });
    await settle();
    expect(mirror.get()).toEqual({ a: 'snapshot', b: 'newer' });
  });

  it('replays every queued event when the engine has no cursor', async () => {
    const first = deferred<{ value: Records }>();
    const { ctx, mirror } = setup({ loads: [first] });
    ctx.connect({ api: null });
    ctx.emitDocumentEvent(deleted('x'));
    first.resolve({ value: { x: 'stale', y: 'kept' } });
    await settle();
    expect(mirror.get()).toEqual({ y: 'kept' });
  });

  it('keeps the previous value on a failed load and applies the queued events to it', async () => {
    const first = deferred<{ value: Records }>();
    const second = deferred<{ value: Records }>();
    const { ctx, mirror } = setup({ loads: [first, second] });
    ctx.connect({ api: null });
    first.resolve({ value: { a: 'A' } });
    await settle();
    const refreshed = mirror.refresh();
    ctx.emitDocumentEvent(upserted('b', 'B'));
    second.reject(new PluginError('operation-failed', 'probe', 'boom'));
    await expect(refreshed).rejects.toThrow('boom');
    expect(mirror.getStatus()).toBe('error');
    expect(mirror.get()).toEqual({ a: 'A', b: 'B' });
  });

  it('reports a permission refusal as forbidden', async () => {
    const first = deferred<{ value: Records }>();
    const { ctx, mirror } = setup({ loads: [first] });
    ctx.connect({ api: null });
    first.reject(new PluginError('permission-denied', 'probe', 'no read grant'));
    await settle();
    expect(mirror.getStatus()).toBe('forbidden');
  });

  it('does not read when readable() is false', async () => {
    const { ctx, mirror, load } = setup({ readable: () => false });
    ctx.connect({ api: null });
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(mirror.getStatus()).toBe('forbidden');
  });

  it('reloads on stream.desynced and document.versioned, without folding them', async () => {
    const loads = [
      deferred<{ value: Records }>(),
      deferred<{ value: Records }>(),
      deferred<{ value: Records }>(),
    ];
    const fold = vi.fn(foldRecords);
    const { ctx, mirror, load } = setup({ loads: [...loads], fold });
    ctx.connect({ api: null });
    loads[0].resolve({ value: { a: 'A' } });
    await settle();
    ctx.emitDocumentEvent(desynced);
    loads[1].resolve({ value: { a: 'A2' } });
    await settle();
    ctx.emitDocumentEvent(versioned);
    loads[2].resolve({ value: { a: 'A3' } });
    await settle();
    expect(load).toHaveBeenCalledTimes(3);
    expect(fold).not.toHaveBeenCalled();
    expect(mirror.get()).toEqual({ a: 'A3' });
  });

  it('coalesces reloads requested while one runs into exactly one more', async () => {
    const loads = [deferred<{ value: Records }>(), deferred<{ value: Records }>()];
    const { ctx, mirror, load } = setup({ loads: [...loads] });
    ctx.connect({ api: null });
    const joined = [mirror.refresh(), mirror.refresh(), mirror.refresh()];
    loads[0].resolve({ value: { a: 'first' } });
    await settle();
    loads[1].resolve({ value: { a: 'second' } });
    await Promise.all(joined);
    expect(load).toHaveBeenCalledTimes(2);
    expect(mirror.get()).toEqual({ a: 'second' });
  });

  it('reports a throwing fold and reloads', async () => {
    const loads = [deferred<{ value: Records }>(), deferred<{ value: Records }>()];
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    const { ctx, mirror, load } = setup({
      loads: [...loads],
      fold: () => {
        throw new Error('unexpected event shape');
      },
    });
    ctx.connect({ api: null });
    loads[0].resolve({ value: {} });
    await settle();
    ctx.emitDocumentEvent(upserted('a', 'A'));
    loads[1].resolve({ value: { a: 'reloaded' } });
    await settle();
    spy.mockRestore();
    expect(errors).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(mirror.get()).toEqual({ a: 'reloaded' });
  });

  it('reloads only the requested pages when the spec can load pages', async () => {
    const first = deferred<{ value: Records }>();
    const loadPages = vi.fn(async () => (value: Records) => ({ ...value, page: 'reloaded' }));
    const { ctx, mirror, load, changes } = setup({
      loads: [first],
      fold: (value, event) =>
        (event as { type: string }).type === 'redaction.applied'
          ? reload({ pages: [{ kind: 'objectNumber', pageObjectNumber: 3 }] })
          : value,
      loadPages,
    });
    ctx.connect({ api: null });
    first.resolve({ value: { a: 'A' } });
    await settle();
    ctx.emitDocumentEvent({
      type: 'redaction.applied',
      origin: origin(null),
    } as unknown as DocumentEvent);
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(loadPages).toHaveBeenCalledTimes(1);
    expect(mirror.get()).toEqual({ a: 'A', page: 'reloaded' });
    expect(changes.at(-1)?.pages).toEqual([{ kind: 'objectNumber', pageObjectNumber: 3 }]);
  });

  it('reports a failed page reload as error until a full load succeeds', async () => {
    const first = deferred<{ value: Records }>();
    const second = deferred<{ value: Records }>();
    const loadPages = vi.fn(async () => {
      throw new Error('offline');
    });
    const { ctx, mirror } = setup({
      loads: [first, second],
      fold: (value, event) =>
        (event as { type: string }).type === 'redaction.applied'
          ? reload({ pages: [{ kind: 'objectNumber', pageObjectNumber: 3 }] })
          : value,
      loadPages,
    });
    ctx.connect({ api: null });
    first.resolve({ value: { a: 'A' } });
    await settle();
    ctx.emitDocumentEvent({
      type: 'redaction.applied',
      origin: origin(null),
    } as unknown as DocumentEvent);
    await mirror.settled();
    // The page could not be read: the value is stale and says so.
    expect(mirror.get()).toEqual({ a: 'A' });
    expect(mirror.getStatus()).toBe('error');

    const refreshed = mirror.refresh();
    second.resolve({ value: { a: 'A2' } });
    await refreshed;
    expect(mirror.getStatus()).toBe('ready');
    expect(mirror.get()).toEqual({ a: 'A2' });
  });

  it('settles once every load and page reload, including ones started meanwhile, finished', async () => {
    const first = deferred<{ value: Records }>();
    const second = deferred<{ value: Records }>();
    const { ctx, mirror } = setup({ loads: [first, second] });
    ctx.connect({ api: null });
    let settled = false;
    void mirror.settled().then(() => (settled = true));
    first.resolve({ value: { a: 'A' } });
    ctx.emitDocumentEvent(desynced);
    await settle();
    expect(settled).toBe(false);
    second.resolve({ value: { a: 'A2' } });
    await settle();
    expect(settled).toBe(true);
    expect(mirror.get()).toEqual({ a: 'A2' });
  });

  it('stops writing once the document instance closes', async () => {
    const handle = makeHandle('doc-1');
    const emit = (handle.events as unknown as { emit(event: unknown): void }).emit;
    interface Api {
      get(): Records;
    }
    const token = createCapabilityToken<Api>('records');
    const plugin = definePlugin<void, Api>({
      id: 'records',
      scope: 'document',
      token,
      create: (ctx) => {
        const mirror = ctx.mirror<Records>({
          name: 'records',
          initial: () => ({}),
          load: async () => ({ value: { a: 'A' } }),
          fold: foldRecords,
        });
        return { api: { get: mirror.get } };
      },
    });
    const kernel = createKernel({
      engine: immediateEngine({ 'doc-1': handle }),
      plugins: [plugin],
    });
    await kernel.start();
    await kernel.documents.open(bytesInput('doc-1'));
    await settle();
    const records = kernel.capability(token, 'doc-1');
    expect(records.get()).toEqual({ a: 'A' });
    const closing = kernel.documents.close('doc-1');
    emit(upserted('late', 'after close'));
    await closing;
    expect(records.get()).toEqual({ a: 'A' });
  });
});

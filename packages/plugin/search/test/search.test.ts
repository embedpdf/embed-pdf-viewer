import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  isPluginError,
  toPageRef,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { AbortablePromise, EngineError, PermissionDenied } from '@embedpdf/engine-core/runtime';
import type { SearchRequest, SearchSlice } from '@embedpdf/engine-core/runtime';
import { searchPlugin, SearchToken } from '../src';

/**
 * The search plugin through the real kernel: a newest-wins lane for the
 * session, an awaitable `search` with typed events, `cancel` versus `clear`,
 * the permission fallback, and a session-free `findAll`.
 */

const box = { left: 10, bottom: 20, right: 210, top: 320 } as const;
const page = (pageObjectNumber: number, index: number): PageLayout =>
  ({
    index,
    ref: toPageRef(pageObjectNumber),
    label: null,
    size: { width: 200, height: 300 },
    rotation: 0,
    userUnit: 1,
    boxes: { media: { ...box }, crop: { ...box } },
  }) as PageLayout;

const match = (pageObjectNumber: number, charStart: number) => ({
  page: toPageRef(pageObjectNumber),
  charStart,
  charCount: 4,
  segments: [
    {
      quad: {
        p1: { x: 40, y: 280 },
        p2: { x: 60, y: 280 },
        p3: { x: 40, y: 270 },
        p4: { x: 60, y: 270 },
      },
      rect: { left: 40, bottom: 270, right: 60, top: 280 },
      advance: 1 as const,
    },
  ],
});

type Answer = SearchSlice | Error | 'hold';

/** A document whose search answers slices from a script; `'hold'` parks a request until released. */
function fakeDocument(script: Answer[]) {
  const requests: SearchRequest[] = [];
  const held: Array<{
    resolve(slice: SearchSlice): void;
    reject(error: unknown): void;
    aborted: boolean;
  }> = [];
  const listeners = new Set<(event: unknown) => void>();
  const handle = {
    id: 'doc',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: 2, pages: [page(5, 0), page(7, 1)] }) },
    security: { allows: (cap: string) => cap === 'doc.text.search' || cap === 'doc.text.copy' },
    search: {
      query: (request: SearchRequest) => {
        requests.push(request);
        const answer = script.shift();
        return new AbortablePromise<SearchSlice>((resolve, reject, _progress, signal) => {
          if (answer === 'hold') {
            const entry = { resolve, reject, aborted: false };
            signal.addEventListener('abort', () => {
              entry.aborted = true;
              reject(new EngineError('Aborted', 'aborted'));
            });
            held.push(entry);
          } else if (answer instanceof Error) reject(answer);
          else if (answer) resolve(answer);
          else reject(new Error('script exhausted'));
        });
      },
    },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  return {
    engine,
    requests,
    held,
    emit: (error: unknown) => listeners.forEach((listener) => listener(error)),
  };
}

const slice = (
  matches: ReturnType<typeof match>[],
  next: string | null,
  scanned: number,
  total = 2,
): SearchSlice =>
  ({ matches, nextCursor: next, scannedPages: scanned, totalPages: total }) as SearchSlice;

async function boot(script: Answer[]) {
  const doc = fakeDocument(script);
  const kernel = createKernel({ engine: doc.engine, plugins: [searchPlugin()] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  return { ...doc, kernel, api: kernel.capability(SearchToken, 'doc') };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('search session', () => {
  afterEach(() => vi.useRealTimers());

  it('streams hits, projects geometry to page space, and resolves complete with events in order', async () => {
    const { kernel, api } = await boot([
      slice([match(5, 0), match(5, 9)], 'c1', 1),
      slice([match(7, 2)], null, 2),
    ]);
    const log: string[] = [];
    api.onStarted((event) => log.push(`started:${event.query.text}`));
    api.onProgress((event) =>
      log.push(`progress:${event.scanned}/${event.total}:${event.hitCount}`),
    );
    api.onCompleted((event) => log.push(`completed:${event.hitCount}`));

    const result = await api.search({ text: 'test' });
    expect(result).toEqual({ status: 'complete', hitCount: 3 });
    expect(api.getStatus()).toBe('complete');
    expect(log).toEqual(['started:test', 'progress:1/2:2', 'progress:2/2:3', 'completed:3']);

    const first = api.listHits()[0];
    expect(first.pageIndex).toBe(0);
    expect(first.segments[0].rect).toEqual({ x: 30, y: 40, width: 20, height: 10 }); // crop offset applied
    expect(api.listHits({ page: toPageRef(5) })).toBe(api.listHits({ page: toPageRef(5) }));
    expect(api.getHitCount(toPageRef(5))).toBe(2);
    expect(api.listPagesWithHits().map((page) => page.pageObjectNumber)).toEqual([5, 7]);
    expect(api.getActiveHitIndex()).toBe(0);
    await kernel.destroy();
  });

  it('G4: a superseded search cannot publish; its promise resolves superseded', async () => {
    const { kernel, api, held } = await boot(['hold', slice([match(7, 2)], null, 2)]);
    const cancelledEvents: string[] = [];
    api.onCancelled((event) => cancelledEvents.push(event.reason));

    const first = api.search({ text: 'first' });
    await tick();
    const second = api.search({ text: 'second' });
    expect(held[0].aborted).toBe(true); // the older slice was aborted
    held[0].resolve(slice([match(5, 0)], null, 2)); // …and even if it lands, it cannot publish

    await expect(first).resolves.toEqual({ status: 'superseded', hitCount: expect.any(Number) });
    await expect(second).resolves.toEqual({ status: 'complete', hitCount: 1 });
    expect(api.getQuery()?.text).toBe('second');
    expect(api.listHits().map((hit) => hit.page.pageObjectNumber)).toEqual([7]);
    expect(cancelledEvents).toEqual(['superseded']);
    await kernel.destroy();
  });

  it('cancel() stops the scan and keeps the hits found so far; clear() drops the session', async () => {
    const { kernel, api, held } = await boot([slice([match(5, 0)], 'c1', 1), 'hold']);
    const cleared = vi.fn();
    api.onCleared(cleared);

    const running = api.search({ text: 'x' });
    await tick();
    expect(api.getHitCount()).toBe(1);
    api.cancel();
    await expect(running).resolves.toEqual({ status: 'cancelled', hitCount: 1 });
    expect(api.getStatus()).toBe('cancelled');
    expect(api.getHitCount()).toBe(1);

    api.clear();
    expect(api.getStatus()).toBe('idle');
    expect(api.getHitCount()).toBe(0);
    expect(cleared).toHaveBeenCalledTimes(1);
    await kernel.destroy();
  });

  it('a real failure sets status error with the plugin vocabulary, and rejects', async () => {
    const { kernel, api } = await boot([new EngineError('Unknown', 'worker died')]);
    const failed = vi.fn();
    api.onFailed(failed);
    await expect(api.search({ text: 'x' })).rejects.toSatisfy((error) =>
      isPluginError(error, 'operation-failed'),
    );
    expect(api.getStatus()).toBe('error');
    expect(api.getError()).toMatchObject({ code: 'operation-failed', message: 'worker died' });
    expect(failed).toHaveBeenCalledTimes(1);
    await kernel.destroy();
  });

  it('degrades full → rects when snippets are denied, unless the mode is pinned', async () => {
    const { kernel, api, requests } = await boot([
      new PermissionDenied('doc.text.copy'),
      slice([], null, 2),
      slice([], null, 2),
    ]);
    await api.search({ text: 'x' });
    expect(requests.map((request) => request.mode)).toEqual(['full', 'rects']);
    await api.findAll({ text: 'x' }, { mode: 'rects' });
    expect(requests[2].mode).toBe('rects');
    await kernel.destroy();
  });

  it('navigates: goToHit wraps, next/previous step, onActiveHitChanged fires once per change', async () => {
    const { kernel, api } = await boot([slice([match(5, 0), match(5, 9), match(7, 2)], null, 2)]);
    await api.search({ text: 'x' });
    const changes: number[] = [];
    api.onActiveHitChanged((event) => changes.push(event.index));
    expect(api.nextHit()?.charStart).toBe(9);
    expect(api.nextHit()?.charStart).toBe(2);
    expect(api.nextHit()?.charStart).toBe(0); // wrapped
    expect(api.previousHit()?.charStart).toBe(2);
    expect(api.goToHit(1)?.charStart).toBe(9);
    api.goToHit(1); // no change, no event
    expect(changes).toEqual([1, 2, 0, 2, 1]);
    await kernel.destroy();
  });

  it('findAll never touches the session and rejects operation-cancelled on abort', async () => {
    const { kernel, api, held } = await boot([slice([match(5, 0)], null, 2), 'hold']);
    const hits = await api.findAll({ text: 'x' });
    expect(hits.length).toBe(1);
    expect(api.getStatus()).toBe('idle');

    const controller = new AbortController();
    const pending = api.findAll({ text: 'y' }, { signal: controller.signal });
    await tick();
    controller.abort();
    await expect(pending).rejects.toSatisfy((error) => isPluginError(error, 'operation-cancelled'));
    expect(held[0].aborted).toBe(true);
    await kernel.destroy();
  });

  it('re-runs the query after document mutations, coalescing a burst into one rescan', async () => {
    vi.useFakeTimers();
    const { kernel, api, requests, emit } = await boot([slice([], null, 2), slice([], null, 2)]);
    await api.search({ text: 'x' });
    expect(requests.length).toBe(1);
    emit({ type: 'annotation.created' });
    emit({ type: 'annotation.updated' });
    await vi.advanceTimersByTimeAsync(300);
    expect(requests.length).toBe(2);
    await kernel.destroy();
  });

  it('canSearch composes text.search and, for full, text.copy', async () => {
    const { kernel, api } = await boot([]);
    expect(api.canSearch()).toBe(true);
    expect(api.canSearch('full')).toBe(true);
    await kernel.destroy();
  });
});

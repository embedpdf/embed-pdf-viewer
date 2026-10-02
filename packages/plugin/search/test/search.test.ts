import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  isPluginError,
  toPageRef,
  type AnyPlugin,
  type DocumentHandle,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { AbortablePromise, EngineError, PermissionDenied } from '@embedpdf/engine-core/runtime';
import type { SearchRequest, SearchSlice } from '@embedpdf/engine-core/runtime';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import {
  SEARCH_DEFAULTS,
  searchPlugin,
  SearchToken,
  type SearchCapability,
  type SearchConfig,
} from '../src';
import { pageSpaceBoxesOf } from '@embedpdf/engine-core/runtime';

/**
 * The search plugin through the real kernel: a newest-wins lane for the
 * session, an awaitable `search` with typed events, `cancel` versus `clear`,
 * cancelling through a signal, the permission fallback and refusal, page
 * arguments, live settings, and a session-free `findAll`.
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
    boxes: pageSpaceBoxesOf({
      media: { ...box },
      crop: { ...box },
      bleed: { ...box },
      trim: { ...box },
      art: { ...box },
    }),
    pdfCropBox: { ...box },
  }) as PageLayout;

const match = (pageObjectNumber: number, start: number) => ({
  page: toPageRef(pageObjectNumber),
  start,
  count: 4,
  // In page space, as the engine hands matches out.
  segments: [
    {
      quad: {
        upperLeft: { x: 30, y: 40 },
        upperRight: { x: 50, y: 40 },
        lowerLeft: { x: 30, y: 50 },
        lowerRight: { x: 50, y: 50 },
      },
      rect: { x: 30, y: 40, width: 20, height: 10 },
      advance: 1 as const,
    },
  ],
});

type Answer = SearchSlice | Error | 'hold';

/**
 * A document whose search answers slices from a script; `'hold'` parks a request until released.
 * The session may search and copy unless `allows` says otherwise.
 */
function fakeDocument(
  script: Answer[],
  allows: (permission: string) => boolean = (permission) =>
    permission === 'doc.text.search' || permission === 'doc.text.copy',
) {
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
    security: { allows },
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
  pagesSearched: number,
  pageCount = 2,
): SearchSlice => ({ matches, nextCursor: next, pagesSearched, pageCount }) as SearchSlice;

/** A stage that records where search reveals hits, standing in for the real one. */
function fakeStage() {
  const reveals: unknown[] = [];
  const plugin: AnyPlugin = {
    id: 'stage',
    token: StageToken,
    scope: 'document',
    create: () => ({
      api: {
        getCurrentPage: () => null,
        reveal: (_page: unknown, options: unknown) => reveals.push(options),
      },
    }),
  };
  return { plugin, reveals };
}

async function boot(
  script: Answer[],
  options: {
    config?: SearchConfig;
    plugins?: AnyPlugin[];
    allows?: (permission: string) => boolean;
  } = {},
) {
  const doc = fakeDocument(script, options.allows);
  const kernel = createKernel({
    engine: doc.engine,
    plugins: [searchPlugin(options.config), ...(options.plugins ?? [])],
  });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  return { ...doc, kernel, api: kernel.capability(SearchToken, 'doc') };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

/** Every event the session fires, by name, from now on. */
function recordEvents(api: SearchCapability): string[] {
  const events: string[] = [];
  api.onStarted(() => events.push('started'));
  api.onProgressChanged(() => events.push('progressChanged'));
  api.onCompleted(() => events.push('completed'));
  api.onCancelled(() => events.push('cancelled'));
  api.onFailed(() => events.push('failed'));
  api.onActiveHitChanged(() => events.push('activeHitChanged'));
  api.onCleared(() => events.push('cleared'));
  return events;
}

describe('search session', () => {
  afterEach(() => vi.useRealTimers());

  it('streams hits with their page-space geometry and resolves complete with events in order', async () => {
    const { kernel, api } = await boot([
      slice([match(5, 0), match(5, 9)], 'c1', 1),
      slice([match(7, 2)], null, 2),
    ]);
    const log: string[] = [];
    api.onStarted((event) => log.push(`started:${event.query.text}`));
    api.onProgressChanged((event) =>
      log.push(`progress:${event.pagesSearched}/${event.pageCount}:${event.hitCount}`),
    );
    api.onCompleted((event) => log.push(`completed:${event.hitCount}`));

    const result = await api.search({ text: 'test' });
    expect(result).toEqual({ status: 'complete', hitCount: 3 });
    expect(api.getStatus()).toBe('complete');
    expect(log).toEqual(['started:test', 'progress:1/2:2', 'progress:2/2:3', 'completed:3']);

    const first = api.listHits()[0];
    expect(first.pageIndex).toBe(0);
    expect(first.segments[0].rect).toEqual({ x: 30, y: 40, width: 20, height: 10 });
    expect(first.segments[0].quad.upperLeft).toEqual({ x: 30, y: 40 });
    expect(first.segments[0].quad.lowerRight).toEqual({ x: 50, y: 50 });
    expect(api.listHits({ page: toPageRef(5) })).toBe(api.listHits({ page: toPageRef(5) }));
    expect(api.getHitCount(toPageRef(5))).toBe(2);
    expect(api.listPagesWithHits().map((page) => page.objectNumber)).toEqual([5, 7]);
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
    expect(api.listHits().map((hit) => hit.page.objectNumber)).toEqual([7]);
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

  it('drops snippets when they are denied, unless snippets are pinned', async () => {
    const { kernel, api, requests } = await boot([
      new PermissionDenied('doc.text.copy'),
      slice([], null, 2),
      slice([], null, 2),
    ]);
    await api.search({ text: 'x' });
    expect(requests.map((request) => request.snippets)).toEqual([true, false]);
    await api.findAll({ text: 'x' }, { snippets: false });
    expect(requests[2].snippets).toBe(false);
    await kernel.destroy();
  });

  it('navigates: goToHit wraps, next/previous step, onActiveHitChanged fires once per change', async () => {
    const { kernel, api } = await boot([slice([match(5, 0), match(5, 9), match(7, 2)], null, 2)]);
    await api.search({ text: 'x' });
    const changes: number[] = [];
    api.onActiveHitChanged((event) => changes.push(event.index));
    expect(api.nextHit()?.start).toBe(9);
    expect(api.nextHit()?.start).toBe(2);
    expect(api.nextHit()?.start).toBe(0); // wrapped
    expect(api.previousHit()?.start).toBe(2);
    expect(api.goToHit(1)?.start).toBe(9);
    api.goToHit(1); // no change, no event
    expect(changes).toEqual([1, 2, 0, 2, 1]);
    await kernel.destroy();
  });

  it('goToHit takes the hit itself, as a click on the page hands it over', async () => {
    const stage = fakeStage();
    const { kernel, api } = await boot([slice([match(5, 0), match(5, 9), match(7, 2)], null, 2)], {
      plugins: [stage.plugin],
    });
    await api.search({ text: 'x' });
    const [, second, third] = api.listHits();

    expect(api.goToHit(third)).toBe(third);
    expect(api.getActiveHitIndex()).toBe(2);
    expect(stage.reveals).toHaveLength(1);
    // A hit kept from before the search ran again is found by what it covers.
    expect(api.goToHit({ ...second })).toBe(second);
    expect(api.getActiveHitIndex()).toBe(1);

    // A hit that isn't among them changes nothing.
    expect(api.goToHit({ ...second, start: 40 })).toBeNull();
    expect(api.goToHit({ ...second, page: toPageRef(9) })).toBeNull();
    expect(api.getActiveHitIndex()).toBe(1);
    expect(stage.reveals).toHaveLength(2);
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
    emit({ type: 'annotations.created' });
    emit({ type: 'annotations.updated' });
    await vi.advanceTimersByTimeAsync(300);
    expect(requests.length).toBe(2);
    await kernel.destroy();
  });

  it('canSearch composes text.search and, for snippets, text.copy', async () => {
    const { kernel, api } = await boot([]);
    expect(api.canSearch()).toBe(true);
    expect(api.canSearch({ snippets: true })).toBe(true);
    await kernel.destroy();

    const searchOnly = await boot([], { allows: (permission) => permission === 'doc.text.search' });
    expect(searchOnly.api.canSearch()).toBe(true);
    expect(searchOnly.api.canSearch({ snippets: true })).toBe(false);
    await searchOnly.kernel.destroy();
  });

  it('refuses to search without doc.text.search, naming it, before the engine is asked', async () => {
    const { kernel, api, requests } = await boot([], { allows: () => false });
    const events = recordEvents(api);
    expect(api.canSearch()).toBe(false);
    for (const refused of [api.search({ text: 'x' }), api.findAll({ text: 'x' })]) {
      await expect(refused).rejects.toSatisfy(
        (error) =>
          isPluginError(error, 'permission-denied') && error.permission === 'doc.text.search',
      );
    }
    expect(requests).toEqual([]);
    // A refusal only rejects: the session is as it was, and nothing is announced.
    expect(api.getStatus()).toBe('idle');
    expect(api.getError()).toBeNull();
    expect(events).toEqual([]);
    await expect(api.search({ text: '' })).resolves.toEqual({ status: 'complete', hitCount: 0 });
    await kernel.destroy();
  });

  it('onProgressChanged carries the pages searched, of how many, and the matches so far', async () => {
    const { kernel, api } = await boot([slice([match(5, 0)], 'c1', 1), slice([], null, 2)]);
    const events: unknown[] = [];
    api.onProgressChanged((event) => events.push(event));
    await api.search({ text: 'x' });
    expect(events).toEqual([
      { hitCount: 1, pagesSearched: 1, pageCount: 2 },
      { hitCount: 1, pagesSearched: 2, pageCount: 2 },
    ]);
    await kernel.destroy();
  });

  it('onProgressChanged follows getProgress(): back to none when a new search starts or the session clears', async () => {
    const { kernel, api } = await boot([
      slice([match(5, 0)], null, 2),
      slice([match(7, 2)], null, 2),
    ]);
    await api.search({ text: 'x' });
    const events: string[] = [];
    api.onProgressChanged((event) => {
      // Fired from the state change, so the getters already agree with it.
      expect(api.getProgress()).toEqual({
        pagesSearched: event.pagesSearched,
        pageCount: event.pageCount,
      });
      expect(api.getHitCount()).toBe(event.hitCount);
      events.push(`${event.pagesSearched}/${event.pageCount}:${event.hitCount}`);
    });
    api.onStarted(() => events.push('started'));

    await api.search({ text: 'y' });
    expect(events).toEqual(['0/0:0', 'started', '2/2:1']);

    api.goToHit(0); // the active hit is already 0, and progress doesn't move
    api.clear();
    expect(events).toEqual(['0/0:0', 'started', '2/2:1', '0/0:0']);
    await kernel.destroy();
  });
});

describe('page arguments', () => {
  it('take a ref or an index, and refuse a page that is not in the document', async () => {
    const { kernel, api, requests } = await boot([
      slice([match(5, 0), match(5, 9), match(7, 2)], null, 2),
    ]);
    await api.search({ text: 'x' }, { from: 1 });
    expect(requests[0].from).toEqual(toPageRef(7)); // index 1 is page 7

    expect(api.listHits({ page: 0 })).toBe(api.listHits({ page: toPageRef(5) }));
    expect(api.getHitCount(1)).toBe(1);
    expect(api.getHitCount(toPageRef(5))).toBe(2);

    // A read of a page that isn't there is empty: a layer may read while its page is deleted.
    expect(api.listHits({ page: 2 })).toEqual([]);
    expect(api.listHits({ page: toPageRef(9) })).toEqual([]);
    expect(api.getHitCount(toPageRef(9))).toBe(0);
    expect(api.getHitCount(-1)).toBe(0);

    // A verb refuses it, and only rejects: the finished session stays as it was.
    const events = recordEvents(api);
    await expect(api.search({ text: 'x' }, { from: toPageRef(9) })).rejects.toSatisfy((error) =>
      isPluginError(error, 'not-found'),
    );
    expect(requests.length).toBe(1); // the refused search never reached the engine
    expect(api.getStatus()).toBe('complete');
    expect(api.getHitCount()).toBe(3);
    expect(events).toEqual([]);
    await kernel.destroy();
  });
});

describe('cancelling', () => {
  it('a signal cancels a running search: the slice is aborted and the hits so far stay', async () => {
    const { kernel, api, held } = await boot([slice([match(5, 0)], 'c1', 1), 'hold']);
    const reasons: string[] = [];
    api.onCancelled((event) => reasons.push(event.reason));
    const controller = new AbortController();

    const running = api.search({ text: 'x' }, { signal: controller.signal });
    await tick();
    controller.abort();
    await expect(running).resolves.toEqual({ status: 'cancelled', hitCount: 1 });
    expect(held[0].aborted).toBe(true); // the engine stopped working on the slice
    expect(api.getStatus()).toBe('cancelled');
    expect(api.getHitCount()).toBe(1);
    expect(reasons).toEqual(['cancelled']);
    await kernel.destroy();
  });

  it('a signal that already fired starts nothing, and refresh() takes one too', async () => {
    const { kernel, api, requests, held } = await boot([slice([], null, 2), 'hold']);
    const fired = AbortSignal.abort();
    await expect(api.search({ text: 'x' }, { signal: fired })).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(requests).toEqual([]);

    await api.search({ text: 'x' });
    const controller = new AbortController();
    const refreshing = api.refresh({ signal: controller.signal });
    await tick();
    controller.abort();
    await expect(refreshing).resolves.toMatchObject({ status: 'cancelled' });
    expect(held[0].aborted).toBe(true);
    await kernel.destroy();
  });

  it('a newer search still supersedes one running with a signal', async () => {
    const { kernel, api } = await boot(['hold', slice([], null, 2)]);
    const controller = new AbortController();
    const first = api.search({ text: 'first' }, { signal: controller.signal });
    await tick();
    const second = api.search({ text: 'second' });
    await expect(first).resolves.toMatchObject({ status: 'superseded' });
    await expect(second).resolves.toMatchObject({ status: 'complete' });
    controller.abort(); // too late to matter
    expect(api.getQuery()?.text).toBe('second');
    await kernel.destroy();
  });
});

describe('settings', () => {
  it('start from the defaults, with what the app registered merged over them', async () => {
    const { kernel, api } = await boot([], { config: { highlight: { color: '#00ff00' } } });
    expect(api.getSettings()).toEqual({
      ...SEARCH_DEFAULTS,
      highlight: { ...SEARCH_DEFAULTS.highlight, color: '#00ff00' },
    });
    await kernel.destroy();
  });

  it('a reveal change applies to the next move at once, and a call can still override it', async () => {
    const stage = fakeStage();
    const { kernel, api } = await boot([slice([match(5, 0), match(5, 9)], null, 2)], {
      plugins: [stage.plugin],
    });
    await api.search({ text: 'x' });

    api.nextHit();
    expect(stage.reveals.at(-1)).toMatchObject({ anchor: { y: 0.35 }, behavior: 'smooth' });

    api.updateSettings({ reveal: { anchor: { y: 'center' }, behavior: 'instant' } });
    api.nextHit();
    expect(stage.reveals.at(-1)).toMatchObject({ anchor: { y: 'center' }, behavior: 'instant' });

    api.revealActiveHit({ behavior: 'smooth' });
    expect(stage.reveals.at(-1)).toMatchObject({ anchor: { y: 'center' }, behavior: 'smooth' });
    await kernel.destroy();
  });

  it('a highlight change keeps the colors it leaves out, fires once, and reset goes back to what was registered', async () => {
    const { kernel, api } = await boot([], { config: { highlight: { activeColor: '#ff0000' } } });
    const changes: unknown[] = [];
    api.onSettingsChanged((event) => changes.push(event.changed));

    api.updateSettings({ highlight: { color: 'rgb(253 224 71 / 0.4)', blendMode: 'normal' } });
    expect(api.getSettings().highlight).toEqual({
      color: 'rgb(253 224 71 / 0.4)',
      activeColor: '#ff0000',
      blendMode: 'normal',
    });
    expect(changes).toEqual([['highlight']]);

    api.resetSettings();
    expect(api.getSettings().highlight).toEqual({
      ...SEARCH_DEFAULTS.highlight,
      activeColor: '#ff0000',
    });
    expect(changes).toEqual([['highlight'], ['highlight']]);
    await kernel.destroy();
  });

  it('work without a document: changed before the first opens, seen by it', async () => {
    const doc = fakeDocument([]);
    const kernel = createKernel({ engine: doc.engine, plugins: [searchPlugin()] });
    await kernel.start();
    const settings = kernel.settingsOf(SearchToken);
    expect(settings.getSettings()).toEqual(SEARCH_DEFAULTS);

    settings.updateSettings({ highlight: { color: '#00ff00' } });
    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    expect(kernel.capability(SearchToken, 'doc').getSettings().highlight.color).toBe('#00ff00');
    await kernel.destroy();
  });
});

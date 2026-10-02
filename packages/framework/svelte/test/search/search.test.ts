import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/svelte';
import type { DocumentHandle, Engine, Kernel, PageLayout } from '@embedpdf/core';
import { toPageRef } from '../../src/runtime';
import type { CurrentValue } from '../../src/runtime';
import {
  SEARCH_DEFAULTS,
  SearchLayer,
  SearchToken,
  searchPlugin,
  searchState,
  useSearchHits,
  useSearchSettings,
  useSearchState,
} from '../../src/search';
import type { SearchConfig, SearchHit } from '../../src/search';
import LayerPages from '../fixtures/LayerPages.svelte';
import { pageContext } from '../fixtures/page-context';
import Probes from '../fixtures/Probes.svelte';
import { signal } from '../fixtures/signal.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The search readers and layer against a real kernel: the declared state, the hits by page, the
 * settings with and without a document, the highlight painted through its CSS variables, and a
 * click on a match told apart from a drag that starts on it.
 */

const box = { x: 0, y: 0, width: 600, height: 800 };
const pageLayout = (objectNumber: number, index: number): PageLayout => ({
  index,
  ref: toPageRef(objectNumber),
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: box, crop: box, bleed: box, trim: box, art: box },
  pdfCropBox: { left: 0, bottom: 0, right: 600, top: 800 },
});

/**
 * A match on one line, in page space: upright, or slanted (its right end 5 points higher), which
 * the layer draws as a polygon instead of a box.
 */
const match = (objectNumber: number, start: number, slant = 0) => ({
  page: toPageRef(objectNumber),
  start,
  count: 4,
  segments: [
    {
      quad: {
        upperLeft: { x: 30, y: 40 + start },
        upperRight: { x: 50, y: 40 + start - slant },
        lowerLeft: { x: 30, y: 50 + start },
        lowerRight: { x: 50, y: 50 + start - slant },
      },
      rect: { x: 30, y: 40 + start - slant, width: 20, height: 10 + slant },
      advance: 1 as const,
    },
  ],
});

/** Pages 5 and 7; a search finds two upright matches on page 5, then a slanted one on page 7. */
function searchEngine(): Engine {
  const slices = () => [
    { matches: [match(5, 0), match(5, 9)], nextCursor: 'c1', pagesSearched: 1, pageCount: 2 },
    { matches: [match(7, 2, 5)], nextCursor: null, pagesSearched: 2, pageCount: 2 },
  ];
  let script = slices();
  const handle = {
    id: 'doc',
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: {
      list: () => Promise.resolve({ pageCount: 2, pages: [pageLayout(5, 0), pageLayout(7, 1)] }),
    },
    security: { allows: () => true },
    search: {
      query: (request: { cursor?: string }) => {
        if (request.cursor === undefined) script = slices();
        return Promise.resolve(script.shift());
      },
    },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => ({
  read,
  pick: pick as (result: unknown) => unknown,
  seen: [] as unknown[],
});
const whole = <T extends object>(record: T) => ({ ...record });
const current = <T>(value: CurrentValue<T>) => value.current;

function mountProbes(probes: ReturnType<typeof probe>[], config?: SearchConfig) {
  return viewerWith([searchPlugin(config)], Probes, { probes }, searchEngine());
}

async function openAndSearch(kernel: Kernel) {
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  const search = kernel.capability(SearchToken);
  await search.search({ text: 'x' });
  flushSync();
  return search;
}

describe('useSearchState', () => {
  it("has exactly the page's State fields: empty with no document, the search's once one is open", async () => {
    const state = probe(() => useSearchState(), whole);
    const { kernel } = await mountProbes([state]);
    expect(latest(state.seen)).toEqual(searchState.empty);

    const search = await openAndSearch(kernel);
    expect(latest(state.seen)).toEqual({
      query: { text: 'x' },
      status: 'complete',
      hitCount: 3,
      activeHitIndex: 0,
      activeHit: search.listHits()[0],
      progress: { pagesSearched: 2, pageCount: 2 },
      error: null,
    });
  });

  it('wakes a reaction only when a field changes, and with a selector only when its value does', async () => {
    const all = probe(() => useSearchState(), whole);
    const counts = probe(() => useSearchState((searchView) => searchView.hitCount), current);
    const { kernel } = await mountProbes([all, counts]);
    const search = await openAndSearch(kernel);
    const [allRuns, countRuns] = [all.seen.length, counts.seen.length];

    void search.goToHit(0); // already the active one
    search.updateSettings({ highlight: { color: 'red' } }); // wakes readers, no field changes
    flushSync();
    expect(all.seen).toHaveLength(allRuns);

    void search.nextHit();
    flushSync();
    expect(all.seen).toHaveLength(allRuns + 1);
    expect(latest(all.seen)).toMatchObject({ activeHitIndex: 1, activeHit: search.listHits()[1] });
    expect(counts.seen).toHaveLength(countRuns); // the count didn't change
  });
});

describe('useSearchHits', () => {
  it("gives every hit, or one page's by ref or index, as the plugin's own arrays", async () => {
    const all = probe(() => useSearchHits(), current);
    const onFive = probe(() => useSearchHits(toPageRef(5)), current);
    const onSecond = probe(() => useSearchHits(1), current);
    const { kernel } = await mountProbes([all, onFive, onSecond]);
    expect(latest(all.seen)).toEqual([]);

    const search = await openAndSearch(kernel);
    expect(latest(all.seen)).toBe(search.listHits());
    expect(latest(onFive.seen)).toBe(search.listHits({ page: toPageRef(5) }));
    expect((latest(onFive.seen) as SearchHit[]).map((hit) => hit.start)).toEqual([0, 9]);
    expect((latest(onSecond.seen) as SearchHit[]).map((hit) => hit.page)).toEqual([toPageRef(7)]);

    const runs = [all.seen.length, onFive.seen.length, onSecond.seen.length];
    void search.nextHit(); // the active hit moves; the hits stay the same arrays
    flushSync();
    expect([all.seen.length, onFive.seen.length, onSecond.seen.length]).toEqual(runs);
  });

  it('follows a page passed as a function', async () => {
    const page = signal(0);
    const hits = probe(() => useSearchHits(() => page.value), current);
    const { kernel } = await mountProbes([hits]);
    const search = await openAndSearch(kernel);
    expect(latest(hits.seen)).toBe(search.listHits({ page: 0 }));

    page.value = 1;
    flushSync();
    expect(latest(hits.seen)).toBe(search.listHits({ page: 1 }));
  });

  it('is empty for a page that is not in the document, and once the document closes', async () => {
    const missingRef = probe(() => useSearchHits(toPageRef(9)), current);
    const missingIndex = probe(() => useSearchHits(5), current);
    const all = probe(() => useSearchHits(), current);
    const { kernel } = await mountProbes([missingRef, missingIndex, all]);
    await openAndSearch(kernel);
    expect(latest(missingRef.seen)).toEqual([]);
    expect(latest(missingIndex.seen)).toEqual([]);
    expect(latest(all.seen)).toHaveLength(3);

    await kernel.documents.close('doc');
    flushSync();
    expect(latest(all.seen)).toEqual([]);
  });
});

describe('useSearchSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const settings = probe(() => useSearchSettings(), whole);
    const { kernel } = await mountProbes([settings], { highlight: { color: '#00ff00' } });
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(settings.seen)).toEqual({
      ...SEARCH_DEFAULTS,
      highlight: { ...SEARCH_DEFAULTS.highlight, color: '#00ff00' },
    });

    kernel.settingsOf(SearchToken).updateSettings({ reveal: { behavior: 'instant' } });
    flushSync();
    expect(latest(settings.seen)).toMatchObject({
      reveal: { anchor: { y: 0.35 }, behavior: 'instant' },
    });

    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    expect(kernel.capability(SearchToken).getSettings()).toEqual(latest(settings.seen));
  });
});

// ── the layer ──

async function mountLayer(pages: number[][], layerProps: Record<string, unknown> = {}) {
  const onPress = vi.fn();
  const mounted = await viewerWith(
    [searchPlugin()],
    LayerPages,
    {
      pages: pages.map(([objectNumber, index]) => pageContext(objectNumber!, index!)),
      layer: SearchLayer,
      layerProps,
      onPress,
    },
    searchEngine(),
  );
  const byTestId = (id: string) =>
    mounted.view.container.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  return { ...mounted, byTestId, onPress };
}

/** The painted pieces of a page's matches, in hit order. */
const pieces = (page: HTMLElement) =>
  [...(page.firstElementChild?.children ?? [])] as HTMLElement[];

describe('<SearchLayer>', () => {
  it('paints through the CSS variables, over the highlight setting, and follows a change to it', async () => {
    const { kernel, byTestId } = await mountLayer([
      [5, 0],
      [7, 1],
    ]);
    const search = await openAndSearch(kernel);
    // The slanted match is a polygon, painted in `style`: an attribute doesn't read var().
    const polygon = () => byTestId('page-7').querySelector('polygon')!;
    const svg = () => byTestId('page-7').querySelector('svg')!;
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight, #ffd500)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    const [upright] = pieces(byTestId('page-5'));
    expect(upright!.style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    expect(upright!.style.pointerEvents).not.toBe('auto'); // without onHitClick, only paint

    void search.goToHit(2); // page 7's match becomes the active one
    flushSync();
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #ff9632)');

    search.updateSettings({ highlight: { activeColor: '#00ff00', blendMode: 'normal' } });
    flushSync();
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #00ff00)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, normal)');
  });

  it('calls onHitClick for a click, not for a drag that starts on the match; the press reaches the page', async () => {
    const onHitClick = vi.fn();
    const { kernel, byTestId, onPress } = await mountLayer([[5, 0]], { onHitClick });
    const search = await openAndSearch(kernel);
    const [first] = pieces(byTestId('page-5'));
    expect(first!.style.pointerEvents).toBe('auto');

    // A click: the pointer lifts where it went down, give or take a pixel.
    await fireEvent.pointerDown(first!, { clientX: 35, clientY: 45, pointerType: 'mouse' });
    await fireEvent.click(first!, { clientX: 36, clientY: 46 });
    expect(onHitClick).toHaveBeenCalledTimes(1);
    expect(onHitClick).toHaveBeenLastCalledWith(search.listHits()[0]);

    // A drag inside the match: it selected text, so it isn't a click.
    await fireEvent.pointerDown(first!, { clientX: 31, clientY: 45, pointerType: 'mouse' });
    await fireEvent.click(first!, { clientX: 48, clientY: 45 });
    expect(onHitClick).toHaveBeenCalledTimes(1);

    // A finger wobbles more: 7 px is still a tap.
    await fireEvent.pointerDown(first!, { clientX: 35, clientY: 45, pointerType: 'touch' });
    await fireEvent.click(first!, { clientX: 42, clientY: 45 });
    expect(onHitClick).toHaveBeenCalledTimes(2);

    expect(onPress).toHaveBeenCalledTimes(3); // every press went on to the page
  });
});

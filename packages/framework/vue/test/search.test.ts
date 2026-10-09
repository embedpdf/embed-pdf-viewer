import { h, shallowRef } from 'vue';
import type { Component } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { pageTransform } from '@embedpdf/core-geometry';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { makePageContext, providePage, toPageRef } from '../src/runtime';
import {
  SEARCH_DEFAULTS,
  SearchLayer,
  SearchToken,
  searchPlugin,
  searchState,
  useSearchHits,
  useSearchSettings,
  useSearchState,
} from '../src/search';
import type { SearchConfig, SearchHit } from '../src/search';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * The search composables and layer against a real kernel: the declared state,
 * the hits by page, the settings with and without a document, the highlight
 * painted through its CSS variables, and a click on a match told apart from a
 * drag that starts on it.
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
 * A match on one line, in page space: upright, or slanted (its right end 5
 * points higher), which the layer draws as a polygon instead of a box.
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
    // Calls' facts and working sets change nothing here: the same document.
    with() {
      return this;
    },
    setWorkingSet: () => {},
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}

async function mount(
  content: () => ReturnType<typeof h> | ReturnType<typeof h>[],
  config?: SearchConfig,
) {
  return viewerWith([searchPlugin(config)], content, searchEngine());
}

async function openAndSearch(kernel: Awaited<ReturnType<typeof mount>>['kernel']) {
  await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
  await settle();
  const search = kernel.capability(SearchToken);
  await search.search({ text: 'x' });
  await settle();
  return search;
}

const latest = (renders: unknown[]) => renders[renders.length - 1];

/** A component that records what `read` gives each time it renders. */
const recorder = (read: () => () => unknown, renders: unknown[]): Component =>
  probe(() => {
    const value = read();
    return () => {
      renders.push(value());
      return null;
    };
  });

/** Every field of a state composable's refs, read in one render. */
const allFields = (fields: Record<string, { value: unknown }>) => () =>
  Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));

enableAutoUnmount(afterEach);

describe('useSearchState', () => {
  it("has exactly the page's State fields: empty with no document, the search's once one is open", async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(() => h(recorder(() => allFields(useSearchState()), renders)));
    expect(latest(renders)).toEqual(searchState.empty);

    const search = await openAndSearch(kernel);
    expect(latest(renders)).toEqual({
      query: { text: 'x' },
      status: 'complete',
      hitCount: 3,
      activeHitIndex: 0,
      activeHit: search.listHits()[0],
      progress: { pagesSearched: 2, pageCount: 2 },
      error: null,
    });
  });

  it('updates only when a field changes, and with a selector only when its value does', async () => {
    const all: unknown[] = [];
    const counts: unknown[] = [];
    const { kernel } = await mount(() => [
      h(recorder(() => allFields(useSearchState()), all)),
      h(
        recorder(() => {
          const hitCount = useSearchState((state) => state.hitCount);
          return () => hitCount.value;
        }, counts),
      ),
    ]);
    const search = await openAndSearch(kernel);
    const [allRenders, countRenders] = [all.length, counts.length];

    void search.goToHit(0); // already the active one
    search.updateSettings({ highlight: { color: 'red' } }); // wakes readers, no field changes
    await settle();
    expect(all).toHaveLength(allRenders);

    void search.nextHit();
    await settle();
    expect(all).toHaveLength(allRenders + 1);
    expect(latest(all)).toMatchObject({ activeHitIndex: 1, activeHit: search.listHits()[1] });
    expect(counts).toHaveLength(countRenders); // the count didn't change
  });
});

describe('useSearchHits', () => {
  const hitsOf = (page?: Parameters<typeof useSearchHits>[0]) => () => {
    const hits = useSearchHits(page);
    return () => hits.value;
  };

  it("gives every hit, or one page's by ref or index, as the plugin's own arrays", async () => {
    const all: unknown[] = [];
    const onFive: unknown[] = [];
    const onSecond: unknown[] = [];
    const { kernel } = await mount(() => [
      h(recorder(hitsOf(), all)),
      h(recorder(hitsOf(toPageRef(5)), onFive)),
      h(recorder(hitsOf(1), onSecond)),
    ]);
    expect(latest(all)).toEqual([]);

    const search = await openAndSearch(kernel);
    expect(latest(all)).toBe(search.listHits());
    expect(latest(onFive)).toBe(search.listHits({ page: toPageRef(5) }));
    expect((latest(onFive) as SearchHit[]).map((hit) => hit.start)).toEqual([0, 9]);
    expect((latest(onSecond) as SearchHit[]).map((hit) => hit.page)).toEqual([toPageRef(7)]);

    const renders = [all.length, onFive.length, onSecond.length];
    void search.nextHit(); // the active hit moves; the hits stay the same arrays
    await settle();
    expect([all.length, onFive.length, onSecond.length]).toEqual(renders);
  });

  it('follows a page given as a getter', async () => {
    const renders: unknown[] = [];
    const page = shallowRef<number>(0);
    const { kernel } = await mount(() =>
      h(
        recorder(
          hitsOf(() => page.value),
          renders,
        ),
      ),
    );
    await openAndSearch(kernel);
    expect((latest(renders) as SearchHit[]).map((hit) => hit.start)).toEqual([0, 9]);

    page.value = 1;
    await settle();
    expect((latest(renders) as SearchHit[]).map((hit) => hit.page)).toEqual([toPageRef(7)]);
  });

  it('is empty for a page that is not in the document, and once the document closes', async () => {
    const missing: unknown[] = [];
    const all: unknown[] = [];
    const { kernel } = await mount(() => [
      h(recorder(hitsOf(toPageRef(9)), missing)),
      h(recorder(hitsOf(5), missing)),
      h(recorder(hitsOf(), all)),
    ]);
    await openAndSearch(kernel);
    expect(missing.every((hits) => (hits as SearchHit[]).length === 0)).toBe(true);
    expect(latest(all)).toHaveLength(3);

    await kernel.documents.close('doc');
    await settle();
    expect(latest(all)).toEqual([]);
  });
});

describe('useSearchSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(
      () => h(recorder(() => allFields(useSearchSettings()), renders)),
      { highlight: { color: '#00ff00' } },
    );
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(renders)).toEqual({
      ...SEARCH_DEFAULTS,
      highlight: { ...SEARCH_DEFAULTS.highlight, color: '#00ff00' },
    });

    kernel.settingsOf(SearchToken).updateSettings({ reveal: { behavior: 'instant' } });
    await settle();
    expect(latest(renders)).toMatchObject({ reveal: { anchor: { y: 0.35 }, behavior: 'instant' } });

    await kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
    await settle();
    expect(kernel.capability(SearchToken).getSettings().highlight).toBe(
      (latest(renders) as typeof SEARCH_DEFAULTS).highlight,
    );
  });
});

// ── the layer ──

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };
const pageContext = (objectNumber: number, index: number) =>
  makePageContext(
    'doc',
    'test-view',
    toPageRef(objectNumber),
    index,
    NO_FRAME,
    pageTransform({ pageSize: { width: 600, height: 800 }, rotation: 0, scale: 1, dpr: 1 }),
    () => ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 }) as DOMRect,
  );

/** One page with its SearchLayer, inside an element that records every press that reaches it. */
const pageWithLayer = (
  objectNumber: number,
  index: number,
  options: { onHitClick?: (hit: SearchHit) => void; onPress?: () => void } = {},
) =>
  h(
    probe(() => {
      providePage(shallowRef(pageContext(objectNumber, index)));
      return () =>
        h(
          'div',
          { 'data-testid': `page-${objectNumber}`, onPointerdown: options.onPress },
          h(SearchLayer, options.onHitClick ? { onHitClick: options.onHitClick } : {}),
        );
    }),
  );

const pageElement = (objectNumber: number) =>
  document.querySelector(`[data-testid="page-${objectNumber}"]`) as HTMLElement;

/** The painted pieces of a page's matches, in hit order. */
const pieces = (page: HTMLElement) =>
  [...(page.firstElementChild?.children ?? [])] as HTMLElement[];

const pointer = (type: string, target: Element, init: Record<string, unknown>) =>
  target.dispatchEvent(
    Object.assign(new MouseEvent(type, { bubbles: true, ...init }), {
      pointerType: init.pointerType ?? 'mouse',
    }),
  );

describe('<SearchLayer>', () => {
  it('paints through the CSS variables, over the highlight setting, and follows a change to it', async () => {
    const { kernel } = await mount(() => [pageWithLayer(5, 0), pageWithLayer(7, 1)]);
    const search = await openAndSearch(kernel);
    // The slanted match is a polygon, painted in `style`: an attribute doesn't read var().
    const polygon = () => pageElement(7).querySelector('polygon')!;
    const svg = () => pageElement(7).querySelector('svg')!;
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight, #ffd500)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    const [upright] = pieces(pageElement(5));
    expect(upright.style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    expect(upright.style.pointerEvents).not.toBe('auto'); // without @hit-click, only paint

    void search.goToHit(2); // page 7's match becomes the active one
    await settle();
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #ff9632)');

    search.updateSettings({ highlight: { activeColor: '#00ff00', blendMode: 'normal' } });
    await settle();
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #00ff00)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, normal)');
  });

  it('calls @hit-click for a click, not for a drag that starts on the match; the press reaches the page', async () => {
    const onHitClick = vi.fn();
    const onPress = vi.fn();
    const { kernel } = await mount(() => pageWithLayer(5, 0, { onHitClick, onPress }));
    const search = await openAndSearch(kernel);
    const [first] = pieces(pageElement(5));
    expect(first.style.pointerEvents).toBe('auto');

    // A click: the pointer lifts where it went down, give or take a pixel.
    pointer('pointerdown', first, { clientX: 35, clientY: 45 });
    pointer('click', first, { clientX: 36, clientY: 46 });
    expect(onHitClick).toHaveBeenCalledTimes(1);
    expect(onHitClick).toHaveBeenLastCalledWith(search.listHits()[0]);

    // A drag inside the match: it selected text, so it isn't a click.
    pointer('pointerdown', first, { clientX: 31, clientY: 45 });
    pointer('click', first, { clientX: 48, clientY: 45 });
    expect(onHitClick).toHaveBeenCalledTimes(1);

    // A finger wobbles more: 7 px is still a tap.
    pointer('pointerdown', first, { clientX: 35, clientY: 45, pointerType: 'touch' });
    pointer('click', first, { clientX: 42, clientY: 45 });
    expect(onHitClick).toHaveBeenCalledTimes(2);

    expect(onPress).toHaveBeenCalledTimes(3); // every press went on to the page
  });
});

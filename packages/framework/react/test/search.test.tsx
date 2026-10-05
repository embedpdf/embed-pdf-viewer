// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { pageTransform } from '@embedpdf/core-geometry';
import type { DocumentHandle, Engine, PageLayout } from '@embedpdf/core';
import { makePageContext, PageProvider, toPageRef } from '../src/runtime';
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
import { viewerWith } from './counter-plugin';

/**
 * The search hooks and layer against a real kernel: the declared state, the
 * hits by page, the settings with and without a document, the highlight
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

async function mount(children: React.ReactNode, config?: SearchConfig) {
  return viewerWith([searchPlugin(config)], children, searchEngine());
}

async function openAndSearch(kernel: Awaited<ReturnType<typeof mount>>['kernel']) {
  await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
  const search = kernel.capability(SearchToken);
  await act(() => search.search({ text: 'x' }));
  return search;
}

const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe({ read, renders }: { read: () => unknown; renders: unknown[] }) {
  renders.push(read());
  return null;
}

afterEach(cleanup);

describe('useSearchState', () => {
  it("has exactly the page's State fields: empty with no document, the search's once one is open", async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(<Probe read={() => useSearchState()} renders={renders} />);
    expect(latest(renders)).toBe(searchState.empty);

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

  it('re-renders only when a field changes, and with a selector only when its value does', async () => {
    const all: unknown[] = [];
    const counts: unknown[] = [];
    const { kernel } = await mount(
      <>
        <Probe read={() => useSearchState()} renders={all} />
        <Probe read={() => useSearchState((state) => state.hitCount)} renders={counts} />
      </>,
    );
    const search = await openAndSearch(kernel);
    const [allRenders, countRenders] = [all.length, counts.length];

    act(() => void search.goToHit(0)); // already the active one
    act(() => search.updateSettings({ highlight: { color: 'red' } })); // wakes readers, no field changes
    expect(all).toHaveLength(allRenders);

    act(() => void search.nextHit());
    expect(all).toHaveLength(allRenders + 1);
    expect(latest(all)).toMatchObject({ activeHitIndex: 1, activeHit: search.listHits()[1] });
    expect(counts).toHaveLength(countRenders); // the count didn't change
  });
});

describe('useSearchHits', () => {
  it("gives every hit, or one page's by ref or index, as the plugin's own arrays", async () => {
    const all: unknown[] = [];
    const onFive: unknown[] = [];
    const onSecond: unknown[] = [];
    const { kernel } = await mount(
      <>
        <Probe read={() => useSearchHits()} renders={all} />
        <Probe read={() => useSearchHits(toPageRef(5))} renders={onFive} />
        <Probe read={() => useSearchHits(1)} renders={onSecond} />
      </>,
    );
    expect(latest(all)).toEqual([]);

    const search = await openAndSearch(kernel);
    expect(latest(all)).toBe(search.listHits());
    expect(latest(onFive)).toBe(search.listHits({ page: toPageRef(5) }));
    expect((latest(onFive) as SearchHit[]).map((hit) => hit.start)).toEqual([0, 9]);
    expect((latest(onSecond) as SearchHit[]).map((hit) => hit.page)).toEqual([toPageRef(7)]);

    const renders = [all.length, onFive.length, onSecond.length];
    act(() => void search.nextHit()); // the active hit moves; the hits stay the same arrays
    expect([all.length, onFive.length, onSecond.length]).toEqual(renders);
  });

  it('is empty for a page that is not in the document, and once the document closes', async () => {
    const missing: unknown[] = [];
    const all: unknown[] = [];
    const { kernel } = await mount(
      <>
        <Probe read={() => useSearchHits(toPageRef(9))} renders={missing} />
        <Probe read={() => useSearchHits(5)} renders={missing} />
        <Probe read={() => useSearchHits()} renders={all} />
      </>,
    );
    await openAndSearch(kernel);
    expect(missing.every((hits) => (hits as SearchHit[]).length === 0)).toBe(true);
    expect(latest(all)).toHaveLength(3);

    await act(() => kernel.documents.close('doc'));
    expect(latest(all)).toEqual([]);
  });
});

describe('useSearchSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const renders: unknown[] = [];
    const { kernel } = await mount(<Probe read={() => useSearchSettings()} renders={renders} />, {
      highlight: { color: '#00ff00' },
    });
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(renders)).toEqual({
      ...SEARCH_DEFAULTS,
      highlight: { ...SEARCH_DEFAULTS.highlight, color: '#00ff00' },
    });

    act(() => kernel.settingsOf(SearchToken).updateSettings({ reveal: { behavior: 'instant' } }));
    expect(latest(renders)).toMatchObject({ reveal: { anchor: { y: 0.35 }, behavior: 'instant' } });

    await act(() => kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() }));
    expect(kernel.capability(SearchToken).getSettings()).toBe(latest(renders));
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
function PageWithLayer({
  page,
  onHitClick,
  onPress,
}: {
  page: ReturnType<typeof pageContext>;
  onHitClick?: (hit: SearchHit) => void;
  onPress?: () => void;
}) {
  return (
    <PageProvider value={page}>
      <div data-testid={`page-${page.ref.objectNumber}`} onPointerDown={onPress}>
        <SearchLayer {...(onHitClick ? { onHitClick } : {})} />
      </div>
    </PageProvider>
  );
}

/** The painted pieces of a page's matches, in hit order. */
const pieces = (page: HTMLElement) =>
  [...(page.firstElementChild?.children ?? [])] as HTMLElement[];

describe('<SearchLayer>', () => {
  it('paints through the CSS variables, over the highlight setting, and follows a change to it', async () => {
    const { kernel, getByTestId } = await mountLayer(
      <>
        <PageWithLayer page={pageContext(5, 0)} />
        <PageWithLayer page={pageContext(7, 1)} />
      </>,
    );
    const search = await openAndSearch(kernel);
    // The slanted match is a polygon, painted in `style`: an attribute doesn't read var().
    const polygon = () => getByTestId('page-7').querySelector('polygon')!;
    const svg = () => getByTestId('page-7').querySelector('svg')!;
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight, #ffd500)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    const [upright] = pieces(getByTestId('page-5'));
    expect(upright.style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    expect(upright.style.pointerEvents).not.toBe('auto'); // without onHitClick, only paint

    act(() => void search.goToHit(2)); // page 7's match becomes the active one
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #ff9632)');

    act(() =>
      search.updateSettings({ highlight: { activeColor: '#00ff00', blendMode: 'normal' } }),
    );
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #00ff00)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, normal)');
  });

  it('calls onHitClick for a click, not for a drag that starts on the match; the press reaches the page', async () => {
    const onHitClick = vi.fn();
    const onPress = vi.fn();
    const { kernel, getByTestId } = await mountLayer(
      <PageWithLayer page={pageContext(5, 0)} onHitClick={onHitClick} onPress={onPress} />,
    );
    const search = await openAndSearch(kernel);
    const [first] = pieces(getByTestId('page-5'));
    expect(first.style.pointerEvents).toBe('auto');

    // A click: the pointer lifts where it went down, give or take a pixel.
    fireEvent.pointerDown(first, { clientX: 35, clientY: 45, pointerType: 'mouse' });
    fireEvent.click(first, { clientX: 36, clientY: 46 });
    expect(onHitClick).toHaveBeenCalledTimes(1);
    expect(onHitClick).toHaveBeenLastCalledWith(search.listHits()[0]);

    // A drag inside the match: it selected text, so it isn't a click.
    fireEvent.pointerDown(first, { clientX: 31, clientY: 45, pointerType: 'mouse' });
    fireEvent.click(first, { clientX: 48, clientY: 45 });
    expect(onHitClick).toHaveBeenCalledTimes(1);

    // A finger wobbles more: 7 px is still a tap.
    fireEvent.pointerDown(first, { clientX: 35, clientY: 45, pointerType: 'touch' });
    fireEvent.click(first, { clientX: 42, clientY: 45 });
    expect(onHitClick).toHaveBeenCalledTimes(2);

    expect(onPress).toHaveBeenCalledTimes(3); // every press went on to the page
  });
});

async function mountLayer(children: React.ReactNode) {
  const mounted = await mount(children);
  const getByTestId = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  return { ...mounted, getByTestId };
}

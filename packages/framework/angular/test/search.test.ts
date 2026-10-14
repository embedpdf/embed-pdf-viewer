/**
 * The search binding against a real kernel: the service's State signals, `hits()` and
 * `hitsOn(page)` as the plugin's own arrays, the settings with and without a document, the
 * streams; the layer painting through its CSS variables, over the highlight setting; and a click
 * on a match told apart from a drag that starts on it, with the press still reaching the page.
 */
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import { pageTransform } from '@embedpdf/core-geometry';
import { createPageContext, EPDF_PAGE } from '@embedpdf/angular/runtime';
import {
  EpdfSearch,
  EpdfSearchLayer,
  SEARCH_DEFAULTS,
  SearchToken,
  searchState,
  withSearch,
  type SearchConfig,
  type SearchHit,
} from '@embedpdf/angular/search';
import { bytesInput, kernelOf, mount, viewerHost } from './fixtures';
import { searchEngine } from './search-fixtures';

// ── a page for the layer ──

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };
const pageContextOf = (objectNumber: number, index: number) =>
  createPageContext({
    documentId: () => 'doc',
    ref: () => toPageRef(objectNumber),
    view: () => 'test-view',
    pageIndex: signal(index),
    frame: signal(NO_FRAME),
    transform: signal(
      pageTransform({ pageSize: { width: 600, height: 800 }, rotation: 0, scale: 1, dpr: 1 }),
    ),
    getRect: () => new DOMRect(0, 0, 600, 800),
  });

/** Page 5 with its layer, inside an element that counts every press that reaches it. */
@Component({
  selector: 'test-page-five',
  imports: [EpdfSearchLayer],
  providers: [{ provide: EPDF_PAGE, useFactory: () => pageContextOf(5, 0) }],
  template: `<div class="page-5" (pointerdown)="presses = presses + 1"><epdf-search-layer /></div>`,
})
class PageFive {
  presses = 0;
}

/** Page 7 with its layer. */
@Component({
  selector: 'test-page-seven',
  imports: [EpdfSearchLayer],
  providers: [{ provide: EPDF_PAGE, useFactory: () => pageContextOf(7, 1) }],
  template: `<div class="page-7"><epdf-search-layer /></div>`,
})
class PageSeven {}

/** Page 5 with a layer whose matches are clickable. */
@Component({
  selector: 'test-clickable-page',
  imports: [EpdfSearchLayer],
  providers: [{ provide: EPDF_PAGE, useFactory: () => pageContextOf(5, 0) }],
  template: `
    <div class="page-5" (pointerdown)="presses = presses + 1">
      <epdf-search-layer (hitClick)="clicked.push($event)" />
    </div>
  `,
})
class ClickablePage {
  presses = 0;
  readonly clicked: SearchHit[] = [];
}

async function mountViewer(template = '', imports: unknown[] = [], config?: SearchConfig) {
  const fixture = await mount(
    viewerHost({
      template,
      imports: imports as never,
      config: { engine: searchEngine() },
      features: [withSearch(config)],
    }),
  );
  return { fixture, search: fixture.debugElement.injector.get(EpdfSearch) };
}

async function openAndSearch(fixture: Awaited<ReturnType<typeof mountViewer>>['fixture']) {
  const kernel = kernelOf(fixture);
  await kernel.documents.open(bytesInput('doc'));
  await kernel.capability(SearchToken).search({ text: 'x' });
  await fixture.whenStable();
  return kernel.capability(SearchToken);
}

afterEach(() => TestBed.resetTestingModule());

describe('EpdfSearch', () => {
  it("has exactly the page's State fields: empty with no document, the search's once one is open", async () => {
    const { fixture, search } = await mountViewer();
    const state = () => ({
      query: search.query(),
      status: search.status(),
      hitCount: search.hitCount(),
      activeHitIndex: search.activeHitIndex(),
      activeHit: search.activeHit(),
      progress: search.progress(),
      error: search.error(),
    });
    expect(state()).toEqual(searchState.empty);

    const plugin = await openAndSearch(fixture);
    expect(state()).toEqual({
      query: { text: 'x' },
      status: 'complete',
      hitCount: 3,
      activeHitIndex: 0,
      activeHit: plugin.listHits()[0],
      progress: { pagesSearched: 2, pageCount: 2 },
      error: null,
    });
  });

  it('a signal changes only when its field does', async () => {
    const { fixture, search } = await mountViewer();
    await openAndSearch(fixture);
    let activeReads = 0;
    let countReads = 0;
    const active = computed(() => (activeReads++, search.activeHitIndex()));
    const count = computed(() => (countReads++, search.hitCount()));
    active();
    count();

    search.goToHit(0); // already the active one
    search.updateSettings({ highlight: { color: 'red' } }); // wakes readers, no field changes
    active();
    count();
    expect([activeReads, countReads]).toEqual([1, 1]);

    search.nextHit();
    expect(active()).toBe(1);
    count();
    expect([activeReads, countReads]).toEqual([2, 1]); // the count didn't change
  });

  it("gives every hit, or one page's by ref or index, as the plugin's own arrays", async () => {
    const { fixture, search } = await mountViewer();
    const onFive = search.hitsOn(toPageRef(5));
    const page = signal<number>(1);
    const onPage = search.hitsOn(() => page());
    expect(search.hits()).toEqual([]);

    const plugin = await openAndSearch(fixture);
    expect(search.hits()).toBe(plugin.listHits());
    expect(onFive()).toBe(plugin.listHits({ page: toPageRef(5) }));
    expect(onFive().map((hit) => hit.start)).toEqual([0, 9]);
    expect(onPage().map((hit) => hit.page)).toEqual([toPageRef(7)]);

    // A getter follows its page.
    page.set(0);
    expect(onPage()).toBe(onFive());

    const all = search.hits();
    search.nextHit(); // the active hit moves; the hits stay the same arrays
    expect(search.hits()).toBe(all);
  });

  it('is empty for a page that is not in the document, and once the document closes', async () => {
    const { fixture, search } = await mountViewer();
    const missing = [search.hitsOn(toPageRef(9)), search.hitsOn(5)];
    await openAndSearch(fixture);
    expect(missing.every((hits) => hits().length === 0)).toBe(true);
    expect(search.hits()).toHaveLength(3);

    await kernelOf(fixture).documents.close('doc');
    expect(search.hits()).toEqual([]);
  });

  it('reads the settings before any document opens, and follows a change made then', async () => {
    const { fixture, search } = await mountViewer('', [], { highlight: { color: '#00ff00' } });
    const kernel = kernelOf(fixture);
    expect(kernel.documents.list()).toEqual([]);
    expect(search.settings()).toEqual({
      ...SEARCH_DEFAULTS,
      highlight: { ...SEARCH_DEFAULTS.highlight, color: '#00ff00' },
    });

    search.updateSettings({ reveal: { behavior: 'instant' } });
    expect(search.settings()).toMatchObject({
      reveal: { anchor: { y: 0.35 }, behavior: 'instant' },
    });

    await kernel.documents.open(bytesInput('doc'));
    expect(kernel.capability(SearchToken).getSettings()).toBe(search.settings());
  });

  it('streams completed$ and activeHitChanged$', async () => {
    const { fixture, search } = await mountViewer();
    const completed: number[] = [];
    const active: number[] = [];
    search.completed$.subscribe(({ hitCount }) => completed.push(hitCount));
    search.activeHitChanged$.subscribe(({ index }) => active.push(index));
    await openAndSearch(fixture);
    search.nextHit();
    expect(completed).toEqual([3]);
    expect(active.at(-1)).toBe(1);
  });
});

// ── the layer ──

const pieces = (root: HTMLElement, page: string) =>
  [...(root.querySelector(`.${page} epdf-search-layer > div`)?.children ?? [])] as HTMLElement[];

describe('<epdf-search-layer>', () => {
  it('paints through the CSS variables, over the highlight setting, and follows a change to it', async () => {
    const { fixture, search } = await mountViewer('<test-page-five /><test-page-seven />', [
      PageFive,
      PageSeven,
    ]);
    await openAndSearch(fixture);
    const root = fixture.nativeElement as HTMLElement;
    // The slanted match is a polygon, painted in `style`: an attribute doesn't read var().
    const polygon = () => root.querySelector<SVGPolygonElement>('.page-7 polygon')!;
    const svg = () => root.querySelector<SVGSVGElement>('.page-7 svg')!;
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight, #ffd500)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    const [upright] = pieces(root, 'page-5');
    expect(upright!.style.mixBlendMode).toBe('var(--epdf-search-blend-mode, multiply)');
    expect(upright!.style.pointerEvents).not.toBe('auto'); // nobody listens: only paint

    search.goToHit(2); // page 7's match becomes the active one
    await fixture.whenStable();
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #ff9632)');

    search.updateSettings({ highlight: { activeColor: '#00ff00', blendMode: 'normal' } });
    await fixture.whenStable();
    expect(polygon().style.fill).toBe('var(--epdf-search-highlight-active, #00ff00)');
    expect(svg().style.mixBlendMode).toBe('var(--epdf-search-blend-mode, normal)');
  });

  it('emits hitClick for a click, not for a drag that starts on the match; the press reaches the page', async () => {
    const { fixture } = await mountViewer('<test-clickable-page />', [ClickablePage]);
    const plugin = await openAndSearch(fixture);
    const page = fixture.debugElement.children[0]!.componentInstance as ClickablePage;
    const root = fixture.nativeElement as HTMLElement;
    const [first] = pieces(root, 'page-5');
    expect(first!.style.pointerEvents).toBe('auto');

    const pointer = (type: string, x: number, y: number, pointerType = 'mouse') => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      first!.dispatchEvent(event);
    };
    // A click: the pointer lifts where it went down, give or take a pixel.
    pointer('pointerdown', 35, 45);
    pointer('click', 36, 46);
    expect(page.clicked).toEqual([plugin.listHits()[0]]);

    // A drag inside the match: it selected text, so it isn't a click.
    pointer('pointerdown', 31, 45);
    pointer('click', 48, 45);
    expect(page.clicked).toHaveLength(1);

    // A finger wobbles more: 7 px is still a tap.
    pointer('pointerdown', 35, 45, 'touch');
    pointer('click', 42, 45);
    expect(page.clicked).toHaveLength(2);

    expect(page.presses).toBe(3); // every press went on to the page
  });
});
